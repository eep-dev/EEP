import { describe, expect, it } from "vitest";
import { EEPSigner, generateSigningKeyPair, verifyEd25519 } from "@eep-dev/signer";
import { WebhookDispatcher, DEFAULT_RETRY_SCHEDULE_MS, type WebhookHttpClient } from "./webhook-dispatcher.js";
import { BATCH_CONTENT_TYPE } from "./content-mode.js";
import { InMemoryDBAdapter } from "../db/in-memory.js";
import { InMemoryEventBusAdapter } from "../event-bus/in-memory.js";
import { TEST_DELIVERY_EVENT_TYPE } from "../core/request-handler.js";
import type { CloudEvent, SubscriptionRecord } from "../core/request-handler.js";

const SECRET = "test-secret-abcdefghij";

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    subscription_id: "sub_1",
    source_did: "did:web:acme.example",
    delivery_method: "webhook",
    callback_url: "https://agent.example/hooks/eep",
    event_types: ["entity.updated"],
    status: "active",
    failure_count: 0,
    delivery_secret: SECRET,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function event(overrides: Partial<CloudEvent> = {}): CloudEvent {
  return {
    id: "evt_1",
    type: "entity.updated",
    source: "did:web:acme.example",
    time: "2026-01-01T00:00:00.000Z",
    data: { changed: true },
    ...overrides
  };
}

type RecordedCall = { url: string; headers: Record<string, string>; body: string };

/** A scripted HTTP client. `script` entries are status codes; "throw" simulates a connection error. */
function mockClient(script: Array<number | "throw">): { client: WebhookHttpClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const client: WebhookHttpClient = async (url, { headers, body }) => {
    calls.push({ url, headers, body });
    const step = script[Math.min(i, script.length - 1)];
    i += 1;
    if (step === "throw") {
      throw new Error("ECONNREFUSED");
    }
    return { ok: step >= 200 && step < 300, status: step };
  };
  return { client, calls };
}

const NO_DELAY = [0];

describe("WebhookDispatcher", () => {
  it("uses the spec's 7-attempt retry schedule by default", () => {
    expect(DEFAULT_RETRY_SCHEDULE_MS).toEqual([0, 5_000, 30_000, 120_000, 900_000, 3_600_000, 21_600_000]);
  });

  // SPECIFICATION.md §5.2.2 — one event per POST means a high-frequency
  // entity pays a TLS handshake, a signature and a 10s ack round-trip per
  // event. Batching amortises all three.
  describe("batched delivery (§5.2.2)", () => {
    const setup = async (maxBatchSize: number, script: Array<number | "throw"> = [200]) => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ max_batch_size: maxBatchSize }));
      const { client, calls } = mockClient(script);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      return { db, dispatcher, calls };
    };

    const batch = (n: number) => Array.from({ length: n }, (_, i) => event({ id: `evt_${i + 1}` }));

    it("combines events into one POST with the CloudEvents batch media type", async () => {
      const { dispatcher, calls } = await setup(10);
      const results = await dispatcher.dispatchBatch(batch(3), "sub_1");

      expect(calls).toHaveLength(1);
      expect(calls[0]!.headers["content-type"]).toBe(BATCH_CONTENT_TYPE);
      expect(JSON.parse(calls[0]!.body)).toHaveLength(3);
      // One result per event, so callers still see per-event outcomes.
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.delivered)).toBe(true);
    });

    it("keeps each envelope's own id so per-event dedup still works", async () => {
      const { dispatcher, calls } = await setup(10);
      await dispatcher.dispatchBatch(batch(3), "sub_1");
      const sent = JSON.parse(calls[0]!.body) as Array<{ id: string }>;
      expect(sent.map((e) => e.id)).toEqual(["evt_1", "evt_2", "evt_3"]);
    });

    it("signs the whole array once", async () => {
      const { dispatcher, calls } = await setup(10);
      await dispatcher.dispatchBatch(batch(3), "sub_1");
      const call = calls[0]!;
      expect(
        new EEPSigner(SECRET).verify(
          call.headers["webhook-id"]!,
          call.headers["webhook-timestamp"]!,
          call.headers["webhook-signature"]!,
          call.body
        )
      ).toBe(true);
    });

    it("splits into several deliveries at max_batch_size", async () => {
      const { dispatcher, calls } = await setup(2, [200, 200]);
      const results = await dispatcher.dispatchBatch(batch(4), "sub_1");
      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[0]!.body)).toHaveLength(2);
      expect(JSON.parse(calls[1]!.body)).toHaveLength(2);
      expect(results).toHaveLength(4);
    });

    // max_batch_size 1 must be byte-identical to the unbatched path.
    it("sends a single event unbatched when max_batch_size is 1", async () => {
      const { dispatcher, calls } = await setup(1);
      await dispatcher.dispatchBatch(batch(1), "sub_1");
      expect(calls[0]!.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(calls[0]!.body)).toMatchObject({ id: "evt_1" });
    });

    it("applies the subscription filter before batching", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(
        subscription({
          max_batch_size: 10,
          filter: { match: "all", conditions: [{ path: "id", op: "eq", value: "evt_2" }] }
        })
      );
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      await dispatcher.dispatchBatch(batch(3), "sub_1");
      const sent = JSON.parse(calls[0]!.body) as Array<{ id: string }>;
      expect(sent).toHaveLength(1);
      expect(sent[0]!.id).toBe("evt_2");
      // Still the batch media type: a subscriber that opted into batching gets
      // one parsing path regardless of how many events were ready.
      expect(calls[0]!.headers["content-type"]).toBe(BATCH_CONTENT_TYPE);
    });

    // A failed batch is ONE failed delivery, not one per event — otherwise a
    // single failure of a large batch would pause a subscription instantly.
    it("counts a failed batch as one failed delivery", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ max_batch_size: 10 }));
      const { client } = mockClient(["throw"]);
      const dispatcher = new WebhookDispatcher({
        db,
        httpClient: client,
        retryScheduleMs: NO_DELAY,
        pauseAfterFailures: 2
      });

      await dispatcher.dispatchBatch(batch(5), "sub_1");
      const after = await db.getSubscription("sub_1");
      expect(after?.failure_count).toBe(1);
      expect(after?.status).toBe("active");
    });

    it("delivers nothing for an unknown subscription", async () => {
      const { dispatcher, calls } = await setup(10);
      expect(await dispatcher.dispatchBatch(batch(2), "sub_missing")).toEqual([]);
      expect(calls).toHaveLength(0);
    });

    it("delivers nothing for an empty batch", async () => {
      const { dispatcher, calls } = await setup(10);
      expect(await dispatcher.dispatchBatch([], "sub_1")).toEqual([]);
      expect(calls).toHaveLength(0);
    });
  });

  // SPECIFICATION.md §5.2.1 — binary content mode relocates attributes to
  // ce-* headers so a subscriber can route without parsing the body.
  describe("content modes (§5.2.1)", () => {
    const deliverAs = async (format?: "cloudevents/v1.0" | "cloudevents/v1.0-binary") => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription(format ? { delivery_format: format } : {}));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      await dispatcher.dispatch(event());
      return calls[0]!;
    };

    it("defaults to structured mode", async () => {
      const call = await deliverAs();
      expect(JSON.parse(call.body)).toMatchObject({ id: "evt_1", type: "entity.updated" });
      expect(call.headers["ce-id"]).toBeUndefined();
    });

    it("delivers binary mode with ce-* headers and a payload-only body", async () => {
      const call = await deliverAs("cloudevents/v1.0-binary");
      expect(call.headers["ce-id"]).toBe("evt_1");
      expect(call.headers["ce-type"]).toBe("entity.updated");
      expect(JSON.parse(call.body)).toEqual({ changed: true });
    });

    // The signature covers the raw body bytes, so a binary-mode subscriber
    // verifies exactly what it received without reassembling an envelope.
    it("signs the body it actually sends in binary mode", async () => {
      const call = await deliverAs("cloudevents/v1.0-binary");
      expect(
        new EEPSigner(SECRET).verify(
          call.headers["webhook-id"]!,
          call.headers["webhook-timestamp"]!,
          call.headers["webhook-signature"]!,
          call.body
        )
      ).toBe(true);
    });
  });

  // SPECIFICATION.md §5.3.1 — HMAC proves only that someone holding the
  // shared secret sent the event, and the subscriber is one of them. Ed25519
  // makes deliveries attributable and verifiable by third parties.
  describe("asymmetric delivery signatures (§5.3.1)", () => {
    const deliver = async (options: { signingPrivateKey?: string; signingKeyId?: string }) => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription());
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({
        db,
        httpClient: client,
        retryScheduleMs: NO_DELAY,
        ...options
      });
      await dispatcher.dispatch(event());
      return calls[0]!;
    };

    it("signs with HMAC only when no key is configured", async () => {
      const call = await deliver({});
      expect(call.headers["webhook-signature"]).toMatch(/^v1,/);
      expect(call.headers["webhook-signature"]).not.toContain("v1a,");
    });

    it("dual-signs when an Ed25519 key is configured", async () => {
      const { privateKey, publicKey } = generateSigningKeyPair();
      const call = await deliver({ signingPrivateKey: privateKey });
      const header = call.headers["webhook-signature"]!;

      // Both schemes present, space-delimited.
      expect(header.split(" ")).toHaveLength(2);
      // The HMAC token still verifies for subscribers that have not migrated.
      expect(
        new EEPSigner(SECRET).verify(
          call.headers["webhook-id"]!,
          call.headers["webhook-timestamp"]!,
          header,
          call.body
        )
      ).toBe(true);
      // And the Ed25519 token verifies for those that have.
      expect(
        verifyEd25519(publicKey, call.headers["webhook-id"]!, call.headers["webhook-timestamp"]!, header, call.body)
          .valid
      ).toBe(true);
    });

    it("carries the configured key id so a receiver can select from the JWKS", async () => {
      const { privateKey, publicKey } = generateSigningKeyPair();
      const call = await deliver({ signingPrivateKey: privateKey, signingKeyId: "key-2026-08" });
      const result = verifyEd25519(
        publicKey,
        call.headers["webhook-id"]!,
        call.headers["webhook-timestamp"]!,
        call.headers["webhook-signature"]!,
        call.body
      );
      expect(result).toEqual({ valid: true, keyId: "key-2026-08" });
    });

    it("does not verify under an unrelated public key", async () => {
      const { privateKey } = generateSigningKeyPair();
      const other = generateSigningKeyPair();
      const call = await deliver({ signingPrivateKey: privateKey });
      expect(
        verifyEd25519(
          other.publicKey,
          call.headers["webhook-id"]!,
          call.headers["webhook-timestamp"]!,
          call.headers["webhook-signature"]!,
          call.body
        ).valid
      ).toBe(false);
    });
  });

  // SPECIFICATION.md §5.1.3 — the filter narrows what event_types already
  // selected. Before this, a subscriber interested in one field of one object
  // still received every event of that type and discarded the rest, after
  // paying full delivery cost.
  describe("subscription filters (§5.1.3)", () => {
    const dispatchWith = async (
      filter: Parameters<typeof subscription>[0]["filter"],
      overrides: Partial<CloudEvent> = {}
    ) => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ filter }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      const results = await dispatcher.dispatch(event({ data: { status: "published" }, ...overrides }));
      return { results, calls };
    };

    it("delivers an event that satisfies the filter", async () => {
      const { calls } = await dispatchWith({
        match: "all",
        conditions: [{ path: "data.status", op: "eq", value: "published" }]
      });
      expect(calls).toHaveLength(1);
    });

    it("does not deliver an event that fails the filter", async () => {
      const { results, calls } = await dispatchWith({
        match: "all",
        conditions: [{ path: "data.status", op: "eq", value: "draft" }]
      });
      expect(calls).toHaveLength(0);
      // Not a delivery failure — the event was never a candidate, so it must
      // not count toward the subscription's failure counter.
      expect(results).toHaveLength(0);
    });

    it("delivers everything when no filter is set", async () => {
      const { calls } = await dispatchWith(undefined);
      expect(calls).toHaveLength(1);
    });

    // The filter narrows; it never widens. An event whose type was not
    // selected stays undelivered however permissive the filter is.
    it("cannot widen beyond event_types", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(
        subscription({
          event_types: ["com.example.other"],
          filter: { match: "any", conditions: [{ path: "id", op: "exists" }] }
        })
      );
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      await dispatcher.dispatch(event());
      expect(calls).toHaveLength(0);
    });
  });

  // SPECIFICATION.md §7.1 — W3C Trace Context is mirrored into HTTP headers
  // per the CloudEvents Distributed Tracing extension. EEP is multi-hop by
  // design, and without propagation the causal chain breaks at every
  // publisher/subscriber boundary.
  describe("trace context propagation (§7.1)", () => {
    const TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

    const deliver = async (overrides: Partial<CloudEvent>) => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription());
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });
      await dispatcher.dispatch(event(overrides));
      return calls[0]!.headers;
    };

    it("forwards a well-formed traceparent as an HTTP header", async () => {
      const headers = await deliver({ traceparent: TRACEPARENT } as Partial<CloudEvent>);
      expect(headers.traceparent).toBe(TRACEPARENT);
    });

    it("forwards tracestate alongside traceparent", async () => {
      const headers = await deliver({
        traceparent: TRACEPARENT,
        tracestate: "vendor=abc123"
      } as Partial<CloudEvent>);
      expect(headers.tracestate).toBe("vendor=abc123");
    });

    it("sends no trace headers when the event carries none", async () => {
      const headers = await deliver({});
      expect(headers.traceparent).toBeUndefined();
      expect(headers.tracestate).toBeUndefined();
    });

    // A malformed traceparent is worse than none: it silently roots the
    // subscriber's spans under a trace that does not exist.
    it("drops a malformed traceparent rather than forwarding it", async () => {
      const headers = await deliver({ traceparent: "not-a-trace-context" } as Partial<CloudEvent>);
      expect(headers.traceparent).toBeUndefined();
    });

    it("drops tracestate when traceparent is absent or invalid", async () => {
      const headers = await deliver({ tracestate: "vendor=abc123" } as Partial<CloudEvent>);
      expect(headers.tracestate).toBeUndefined();
    });
  });

  // SPECIFICATION.md §10.2: an elapsed lease means no more deliveries. Checked
  // at delivery time rather than by a sweeper, so the rule holds in a
  // deployment with no background job — an unenforced lease is no lease.
  describe("lease enforcement (§10.2)", () => {
    const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

    it("does not deliver to a subscription whose lease has elapsed", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ expires_at: iso(-1000) }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(event());

      expect(results).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });

    it("still delivers while the lease is current", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ expires_at: iso(60_000) }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(event());

      expect(results).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });

    it("treats an absent expires_at as an unbounded lease", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription());
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      expect(await dispatcher.dispatch(event())).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });

    it("ignores an unparseable expires_at rather than dropping traffic", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ expires_at: "not-a-timestamp" }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      expect(await dispatcher.dispatch(event())).toHaveLength(1);
      expect(calls).toHaveLength(1);
    });

    it("does not deliver a test event to an expired subscription either", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ subscription_id: "sub_target", expires_at: iso(-1) }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(
        event({ id: "evt_test_x", type: TEST_DELIVERY_EVENT_TYPE, data: { subscription_id: "sub_target" } })
      );

      expect(results).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });
  });

  // SPECIFICATION.md §5.1.1: a synthetic test delivery is addressed to ONE
  // subscription. It must reach that subscriber even though
  // `com.eep.subscription.test` matches none of their `event_types`, and it
  // must not fan out to anyone else.
  describe("test deliveries (§5.1.1)", () => {
    const testEvent = (subscriptionId: string) =>
      event({
        id: "evt_test_1",
        type: TEST_DELIVERY_EVENT_TYPE,
        data: { subscription_id: subscriptionId }
      });

    it("delivers to the addressed subscription despite no event_types match", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ subscription_id: "sub_target" }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(testEvent("sub_target"));

      expect(results).toHaveLength(1);
      expect(results[0]?.delivered).toBe(true);
      expect(calls).toHaveLength(1);

      // Signed exactly like production traffic — that is what makes the
      // endpoint usable as a conformance probe.
      const { headers, body } = calls[0]!;
      expect(
        new EEPSigner(SECRET).verify(
          headers["webhook-id"]!,
          headers["webhook-timestamp"]!,
          headers["webhook-signature"]!,
          body
        )
      ).toBe(true);
    });

    it("does not fan out to other subscriptions", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ subscription_id: "sub_target" }));
      await db.saveSubscription(
        subscription({ subscription_id: "sub_bystander", callback_url: "https://other.example/hooks" })
      );
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(testEvent("sub_target"));

      expect(results).toHaveLength(1);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("https://agent.example/hooks/eep");
    });

    it("delivers nothing when the addressed subscription does not exist", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ subscription_id: "sub_target" }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(testEvent("sub_missing"));

      expect(results).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });

    it("ignores a malformed test event with no subscription_id", async () => {
      const db = new InMemoryDBAdapter();
      await db.saveSubscription(subscription({ subscription_id: "sub_target" }));
      const { client, calls } = mockClient([200]);
      const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

      const results = await dispatcher.dispatch(
        event({ id: "evt_test_2", type: TEST_DELIVERY_EVENT_TYPE, data: {} })
      );

      expect(results).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });
  });

  it("delivers a matching event with verifiable Standard Webhooks headers", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const { client, calls } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    const evt = event();
    const [result] = await dispatcher.dispatch(evt);

    expect(result?.delivered).toBe(true);
    expect(result?.attempts).toBe(1);
    expect(calls).toHaveLength(1);

    const { headers, body } = calls[0]!;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["webhook-id"]).toBe("msg_evt_1");
    expect(JSON.parse(body)).toEqual(evt);

    const verified = new EEPSigner(SECRET).verify(
      headers["webhook-id"]!,
      headers["webhook-timestamp"]!,
      headers["webhook-signature"]!,
      body
    );
    expect(verified).toBe(true);
  });

  it("selects subscribers by event-type pattern", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription({ subscription_id: "exact", event_types: ["entity.updated"] }));
    await db.saveSubscription(subscription({ subscription_id: "wildcard", event_types: ["entity.*"] }));
    await db.saveSubscription(subscription({ subscription_id: "other", event_types: ["trust.changed"] }));
    const { client } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    const results = await dispatcher.dispatch(event({ type: "entity.updated" }));
    expect(results.map((r) => r.subscription_id).sort()).toEqual(["exact", "wildcard"]);
  });

  it("skips paused, sse, and callback-less subscriptions", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription({ subscription_id: "paused", status: "paused" }));
    await db.saveSubscription(subscription({ subscription_id: "sse", delivery_method: "sse" }));
    await db.saveSubscription(subscription({ subscription_id: "no-url", callback_url: undefined }));
    await db.saveSubscription(subscription({ subscription_id: "live" }));
    const { client, calls } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    const results = await dispatcher.dispatch(event());
    expect(results).toHaveLength(1);
    expect(results[0]?.subscription_id).toBe("live");
    expect(calls).toHaveLength(1);
  });

  it("retries on transient failure and reports the successful attempt", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const { client, calls } = mockClient([503, "throw", 200]);
    const dispatcher = new WebhookDispatcher({
      db,
      httpClient: client,
      retryScheduleMs: [0, 0, 0, 0]
    });

    const [result] = await dispatcher.dispatch(event());
    expect(result?.delivered).toBe(true);
    expect(result?.attempts).toBe(3);
    expect(calls).toHaveLength(3);
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(0);
  });

  it("counts a fully-failed delivery and pauses after the failure threshold", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const { client } = mockClient([500]);
    const dispatcher = new WebhookDispatcher({
      db,
      httpClient: client,
      retryScheduleMs: NO_DELAY,
      pauseAfterFailures: 3
    });

    await dispatcher.dispatch(event({ id: "evt_a" }));
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(1);
    expect((await db.getSubscription("sub_1"))?.status).toBe("active");

    await dispatcher.dispatch(event({ id: "evt_b" }));
    await dispatcher.dispatch(event({ id: "evt_c" }));
    const paused = await db.getSubscription("sub_1");
    expect(paused?.failure_count).toBe(3);
    expect(paused?.status).toBe("paused");

    // Once paused the subscription is no longer a delivery target.
    const results = await dispatcher.dispatch(event({ id: "evt_d" }));
    expect(results).toHaveLength(0);
  });

  it("resets the failure counter after a delivery recovers", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription({ failure_count: 4 }));
    const { client } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    await dispatcher.dispatch(event());
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(0);
  });

  it("fails closed when a subscription cannot be signed", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription({ delivery_secret: undefined }));
    const { client, calls } = mockClient([200]);
    // No fallbackSecret supplied.
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    const [result] = await dispatcher.dispatch(event());
    expect(result?.delivered).toBe(false);
    expect(calls).toHaveLength(0);
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(1);
  });

  it("falls back to the dispatcher secret when a subscription has none", async () => {
    const fallback = "fallback-secret-1234567890";
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription({ delivery_secret: undefined }));
    const { client, calls } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({
      db,
      httpClient: client,
      fallbackSecret: fallback,
      retryScheduleMs: NO_DELAY
    });

    const [result] = await dispatcher.dispatch(event());
    expect(result?.delivered).toBe(true);
    const { headers, body } = calls[0]!;
    expect(
      new EEPSigner(fallback).verify(headers["webhook-id"]!, headers["webhook-timestamp"]!, headers["webhook-signature"]!, body)
    ).toBe(true);
  });

  it("does not penalize a subscription when the dispatcher is stopped", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const { client, calls } = mockClient([500]);
    const dispatcher = new WebhookDispatcher({ db, httpClient: client, retryScheduleMs: NO_DELAY });

    dispatcher.stop();
    const [result] = await dispatcher.dispatch(event());
    expect(result?.aborted).toBe(true);
    expect(result?.delivered).toBe(false);
    expect(calls).toHaveLength(0);
    expect((await db.getSubscription("sub_1"))?.failure_count).toBe(0);
  });

  it("invokes the onDeliveryResult observer once per subscription", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const seen: string[] = [];
    const { client } = mockClient([200]);
    const dispatcher = new WebhookDispatcher({
      db,
      httpClient: client,
      retryScheduleMs: NO_DELAY,
      onDeliveryResult: (r) => seen.push(r.event_id)
    });

    await dispatcher.dispatch(event({ id: "evt_observed" }));
    expect(seen).toEqual(["evt_observed"]);
  });

  it("wires to an event bus via start()", async () => {
    const db = new InMemoryDBAdapter();
    await db.saveSubscription(subscription());
    const bus = new InMemoryEventBusAdapter();
    const { client, calls } = mockClient([200]);

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const dispatcher = new WebhookDispatcher({
      db,
      httpClient: client,
      retryScheduleMs: NO_DELAY,
      onDeliveryResult: () => resolveDone()
    });

    await dispatcher.start(bus);
    await bus.publish(event());
    await done;

    expect(calls).toHaveLength(1);
  });
});
