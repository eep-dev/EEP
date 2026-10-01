import { describe, expect, it, vi } from "vitest";
import { parseGateConfig, type GateProof, type ProofVerifier } from "@eep-dev/gates";
import { EEPServer } from "./eep-server.js";
import { InMemoryEventStore } from "./event-store.js";
import {
  TEST_DELIVERY_EVENT_TYPE,
  DEFAULT_LEASE_SECONDS,
  MIN_LEASE_SECONDS,
  MAX_LEASE_SECONDS
} from "./request-handler.js";
import type { EventBusAdapter, DBAdapter, SubscriptionRecord, SubscriptionUpdate } from "./request-handler.js";

// Prevent real DNS resolution during subscribe validation tests.
vi.mock("@eep-dev/validator", async (importOriginal) => {
  const original = await importOriginal<typeof import("@eep-dev/validator")>();
  return {
    ...original,
    validateSSRF: vi.fn().mockResolvedValue(undefined)
  };
});

class RecordingDBAdapter implements DBAdapter {
  public readonly rows: SubscriptionRecord[] = [];

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    this.rows.push(subscription);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.rows.find((row) => row.subscription_id === subscriptionId) ?? null;
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    return [...this.rows];
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdate): Promise<void> {
    const index = this.rows.findIndex((row) => row.subscription_id === subscriptionId);
    if (index >= 0) {
      this.rows[index] = { ...this.rows[index], ...updates } as SubscriptionRecord;
    }
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    const index = this.rows.findIndex((row) => row.subscription_id === subscriptionId);
    if (index < 0) return false;
    this.rows.splice(index, 1);
    return true;
  }
}

class RecordingEventBusAdapter implements EventBusAdapter {
  public readonly published: string[] = [];
  /** Full envelopes, for assertions that need more than the event type. */
  public readonly events: Array<{ type: string; data?: unknown }> = [];
  async publish(event: { type: string; data?: unknown }): Promise<void> {
    this.published.push(event.type);
    this.events.push(event);
  }
  async subscribe(): Promise<void> {
    return;
  }
}

const paymentVerifier: ProofVerifier = {
  supportedTypes: ["payment"],
  verify: async (proof) => (proof as { token?: string }).token === "tok_valid"
};

describe("EEPServer", () => {
  const gateConfig = parseGateConfig({
    default_tier: "public",
    tiers: {
      public: { requirements: [], access: ["entity.public.profile"] },
      premium: {
        requirements: [{ type: "payment", amount: 1, currency: "usd", per: "request" }],
        access: ["content.papers.full_text"]
      }
    }
  });

  it("returns manifest, entity, services and health payloads", async () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com/",
      did: "did:web:example.com"
    });

    const manifest = await server.getManifestHandler()({
      method: "GET",
      path: "/.well-known/eep.json",
      headers: {}
    });
    expect(manifest.status).toBe(200);
    expect((manifest.body as { did: string }).did).toBe("did:web:example.com");

    const entity = await server.getEntityHandler()({
      method: "GET",
      path: "/u/u/alice",
      headers: {},
      params: { entityType: "u", entityId: "alice" }
    });
    expect(entity.status).toBe(200);
    expect(entity.headers?.["EEP-Version"]).toBe("0.1");

    const defaultEntity = await server.getEntityHandler()({
      method: "GET",
      path: "/u",
      headers: {}
    });
    expect((defaultEntity.body as { id: string }).id).toBe("default");

    const services = await server.getServicesHandler()({
      method: "GET",
      path: "/eep/services",
      headers: {}
    });
    expect(services.status).toBe(200);

    const health = await server.getHealthHandler()({
      method: "GET",
      path: "/healthz",
      headers: {}
    });
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });
  });

  it("enforces gate checks for gated resources", async () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com",
      gateConfig,
      proofVerifiers: [paymentVerifier]
    });

    const denied = await server.getGatedResourceHandler()({
      method: "GET",
      path: "/eep/content/content.papers.full_text",
      headers: {},
      params: { resourcePath: "content.papers.full_text" }
    });
    expect(denied.status).toBe(402);

    const proofs: GateProof[] = [{ type: "payment", token: "tok_valid" }];
    const granted = await server.getGatedResourceHandler()({
      method: "GET",
      path: "/eep/content/content.papers.full_text",
      headers: {
        "x-eep-proofs": JSON.stringify(proofs)
      },
      params: { resourcePath: "content.papers.full_text" }
    });
    expect(granted.status).toBe(200);
    expect((granted.body as { tier: string }).tier).toBe("premium");
  });

  it("stores subscriptions, publishes event and exposes audit log", async () => {
    const db = new RecordingDBAdapter();
    const bus = new RecordingEventBusAdapter();
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com",
      dbAdapter: db,
      eventBusAdapter: bus
    });

    const bad = await server.getSubscribeHandler()({
      method: "POST",
      path: "/eep/subscribe",
      headers: {},
      body: {}
    });
    expect(bad.status).toBe(400);

    const created = await server.getSubscribeHandler()({
      method: "POST",
      path: "/eep/subscribe",
      headers: {},
      body: {
        source_did: "did:web:agent.example",
        delivery_method: "webhook",
        delivery_url: "https://hook.example/notify",
        event_types: ["com.example.entity.updated"]
      }
    });
    expect(created.status).toBe(201);
    expect(db.rows.length).toBe(1);
    expect(bus.published).toEqual(["subscription.created"]);
    // The one-time creation response carries the signing secret...
    expect(typeof (created.body as { delivery_secret?: string }).delivery_secret).toBe("string");

    const audit = await server.getAuditLogHandler()({
      method: "GET",
      path: "/eep/audit-log",
      headers: {}
    });
    expect(audit.status).toBe(200);
    const auditBody = audit.body as {
      subscriptions_count: number;
      subscriptions: Array<Record<string, unknown>>;
    };
    expect(auditBody.subscriptions_count).toBe(1);
    // ...but the audit log never re-exposes it.
    expect(auditBody.subscriptions[0]).not.toHaveProperty("delivery_secret");
  });

  it("returns stream and pulse upgrade hints", async () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });

    const stream = await server.getSSEHandler()({
      method: "GET",
      path: "/eep/stream",
      headers: {}
    });
    expect(stream.status).toBe(200);
    expect(stream.headers?.["Content-Type"]).toBe("text/event-stream");

    const pulse = await server.getPulseUpgradeHandler()({
      method: "GET",
      path: "/eep/pulse",
      headers: {}
    });
    expect(pulse.status).toBe(426);

    const fallback = await server.get402Handler("content.papers.full_text", []);
    expect(fallback.status).toBe(402);
  });

  it("covers default auth parser and default adapters", async () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com",
      gateConfig
    });

    const invalidJson = await server.getGatedResourceHandler()({
      method: "GET",
      path: "/eep/content/content.papers.full_text",
      headers: {
        "x-eep-proofs": "invalid-json"
      },
      params: { resourcePath: "content.papers.full_text" }
    });
    expect(invalidJson.status).toBe(402);

    const wrongShape = await server.getGatedResourceHandler()({
      method: "GET",
      path: "/eep/content/content.papers.full_text",
      headers: {
        "x-eep-proofs": JSON.stringify({ not: "array" })
      },
      params: { resourcePath: "content.papers.full_text" }
    });
    expect(wrongShape.status).toBe(402);

    const defaultResource = await server.getGatedResourceHandler()({
      method: "GET",
      path: "/eep/content",
      headers: {}
    });
    expect(defaultResource.status).toBe(200);

    await server.getSubscribeHandler()({
      method: "POST",
      path: "/eep/subscribe",
      headers: {},
      body: {
        source_did: "did:web:agent.example",
        delivery_method: "sse",
        event_types: ["com.example.*"]
      }
    });
    const audit = await server.getAuditLogHandler()({
      method: "GET",
      path: "/eep/audit-log",
      headers: {}
    });
    expect((audit.body as { subscriptions_count: number }).subscriptions_count).toBe(1);

    const firstSub = (audit.body as { subscriptions: Array<{ subscription_id: string }> }).subscriptions[0];
    const loaded = await server.getSubscription(firstSub.subscription_id);
    expect(loaded?.subscription_id).toBe(firstSub.subscription_id);
    const missing = await server.getSubscription("sub_missing");
    expect(missing).toBeNull();

    await server.subscribeToEvents("subscription.*", () => {
      return;
    });

    const noBody = await server.getSubscribeHandler()({
      method: "POST",
      path: "/eep/subscribe",
      headers: {}
    });
    expect(noBody.status).toBe(400);
  });

  it("returns stable route definitions", () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });
    const routes = server.getRouteDefinitions();
    expect(routes.length).toBe(21);
    const operationIds = routes.map((route) => route.operationId);
    expect(operationIds).toContain("subscribe");
    expect(operationIds).toContain("subscriptionStatus");
    expect(operationIds).toContain("unsubscribe");
    expect(operationIds).toContain("listSubscriptions");
    expect(operationIds).toContain("resumeSubscription");
    expect(operationIds).toContain("pauseSubscription");
    expect(operationIds).toContain("testSubscriptionDelivery");
    expect(operationIds).toContain("eventHistory");
    expect(operationIds).toContain("redeliver");
    expect(operationIds).toContain("deliveryLog");
  });

  // SPECIFICATION.md §5.1.1: creation stays on `POST /eep/subscribe` (it is
  // what the manifest and the rel="subscribe" Link header advertise); every
  // member operation is addressed under the `/eep/subscriptions` collection.
  it("addresses subscription member operations under /eep/subscriptions", () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });
    const routes = server.getRouteDefinitions();
    const find = (operationId: string) => routes.find((r) => r.operationId === operationId);

    expect(find("subscribe")).toMatchObject({ method: "POST", path: "/eep/subscribe" });
    expect(find("listSubscriptions")).toMatchObject({ method: "GET", path: "/eep/subscriptions" });
    expect(find("subscriptionStatus")).toMatchObject({
      method: "GET",
      path: "/eep/subscriptions/:subscriptionId"
    });
    expect(find("unsubscribe")).toMatchObject({
      method: "DELETE",
      path: "/eep/subscriptions/:subscriptionId"
    });
    expect(find("pauseSubscription")).toMatchObject({
      method: "POST",
      path: "/eep/subscriptions/:subscriptionId/pause"
    });
    expect(find("resumeSubscription")).toMatchObject({
      method: "POST",
      path: "/eep/subscriptions/:subscriptionId/resume"
    });
    expect(find("testSubscriptionDelivery")).toMatchObject({
      method: "POST",
      path: "/eep/subscriptions/:subscriptionId/test"
    });
  });

  it("keeps the pre-§5.1.1 /eep/subscribe/:id member paths as deprecated aliases", () => {
    const server = new EEPServer({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });
    const routes = server.getRouteDefinitions();
    expect(routes).toContainEqual(
      expect.objectContaining({
        method: "GET",
        path: "/eep/subscribe/:subscriptionId",
        operationId: "subscriptionStatusDeprecated"
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        method: "DELETE",
        path: "/eep/subscribe/:subscriptionId",
        operationId: "unsubscribeDeprecated"
      })
    );
  });

  describe("subscribe body validation", () => {
    // Includes a "pro" tier with no requirements so the metadata/tier round-trip
    // test below can opt into a non-default tier without supplying gate_proofs.
    const validationGateConfig = parseGateConfig({
      default_tier: "public",
      tiers: {
        public: { requirements: [], access: ["entity.public.profile"] },
        pro: { requirements: [], access: ["entity.public.profile"] }
      }
    });
    const makeServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        gateConfig: validationGateConfig,
        dbAdapter: db,
        eventBusAdapter: bus
      });
      return { db, bus, server };
    };

    const validWebhookBody = {
      source_did: "did:web:agent.example",
      delivery_method: "webhook",
      delivery_url: "https://hook.example/notify",
      event_types: ["com.example.entity.updated"]
    } as const;

    it("rejects missing event_types", async () => {
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...validWebhookBody, event_types: undefined }
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("invalid_request");
    });

    it("rejects empty event_types array", async () => {
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...validWebhookBody, event_types: [] }
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid event type pattern", async () => {
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...validWebhookBody, event_types: ["INVALID_PATTERN"] }
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain("INVALID_PATTERN");
    });

    it("rejects webhook without delivery_url", async () => {
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { source_did: "did:web:agent.example", delivery_method: "webhook", event_types: ["com.example.*"] }
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain("delivery_url");
    });

    it("rejects delivery_url that fails SSRF check", async () => {
      const { SSRFError: Err, validateSSRF: mockFn } = await import("@eep-dev/validator");
      vi.mocked(mockFn).mockRejectedValueOnce(new Err("Private address"));
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: validWebhookBody
      });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain("not allowed");
    });

    it("stores metadata and tier on the subscription record", async () => {
      const { server, db } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          ...validWebhookBody,
          metadata: { agent_id: "agent-42", label: "monitor" },
          tier: "pro"
        }
      });
      expect(res.status).toBe(201);
      expect(db.rows[0]?.metadata).toEqual({ agent_id: "agent-42", label: "monitor" });
      expect(db.rows[0]?.tier).toBe("pro");
    });

    it("accepts wildcard event type patterns", async () => {
      const { server } = makeServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...validWebhookBody, event_types: ["com.example.*", "org.other.entity.created"] }
      });
      expect(res.status).toBe(201);
    });
  });

  describe("subscribe gate_proofs validation", () => {
    const makeGatedServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        gateConfig,
        proofVerifiers: [paymentVerifier],
        dbAdapter: db,
        eventBusAdapter: bus
      });
      return { db, bus, server };
    };

    const baseBody = {
      source_did: "did:web:agent.example",
      delivery_method: "webhook",
      delivery_url: "https://hook.example/notify",
      event_types: ["com.example.entity.updated"]
    } as const;

    it("rejects an unknown tier with 400", async () => {
      const { server, db } = makeGatedServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...baseBody, tier: "ghost" }
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("invalid_request");
      expect(db.rows.length).toBe(0);
    });

    it("accepts the default tier without gate_proofs", async () => {
      const { server, db } = makeGatedServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...baseBody, tier: "public" }
      });
      expect(res.status).toBe(201);
      expect(db.rows[0]?.tier).toBe("public");
    });

    it("rejects a gated tier when gate_proofs are missing", async () => {
      const { server, db, bus } = makeGatedServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: { ...baseBody, tier: "premium" }
      });
      expect(res.status).toBe(402);
      const body = res.body as { error: string; required_tier: string; unmet_requirements: Array<{ type: string }> };
      expect(body.error).toBe("access_restricted");
      expect(body.required_tier).toBe("premium");
      expect(body.unmet_requirements.some((u) => u.type === "payment")).toBe(true);
      expect(db.rows.length).toBe(0);
      expect(bus.published).toEqual([]);
    });

    it("accepts a gated tier with valid body gate_proofs", async () => {
      const { server, db } = makeGatedServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          ...baseBody,
          tier: "premium",
          gate_proofs: [{ type: "payment", token: "tok_valid" }]
        }
      });
      expect(res.status).toBe(201);
      expect(db.rows[0]?.tier).toBe("premium");
    });

    it("rejects a gated tier when body gate_proofs fail semantic verification", async () => {
      const { server } = makeGatedServer();
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          ...baseBody,
          tier: "premium",
          gate_proofs: [{ type: "payment", token: "tok_wrong" }]
        }
      });
      expect(res.status).toBe(402);
    });

    it("accepts a gated tier when proofs are supplied via the auth header", async () => {
      const { server, db } = makeGatedServer();
      const proofs: GateProof[] = [{ type: "payment", token: "tok_valid" }];
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: { "x-eep-proofs": JSON.stringify(proofs) },
        body: { ...baseBody, tier: "premium" }
      });
      expect(res.status).toBe(201);
      expect(db.rows[0]?.tier).toBe("premium");
    });
  });

  // SPECIFICATION.md §5.1.2 — webhooks had no catch-up mechanism at all,
  // which bites hardest right after §10 pauses a subscription: the endpoint
  // was down, it missed the most, and resuming produced a silent hole.
  describe("event history and redelivery (§5.1.2)", () => {
    const makeServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const store = new InMemoryEventStore();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        dbAdapter: db,
        eventBusAdapter: bus,
        eventStore: store
      });
      return { db, bus, store, server };
    };

    const evt = (id: string) => ({
      id,
      type: "com.example.entity.updated",
      source: "did:web:acme.example",
      time: "2026-01-01T00:00:00.000Z",
      data: {}
    });

    const createSubscription = async (server: EEPServer): Promise<string> => {
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          source_did: "did:web:agent.example",
          delivery_method: "webhook",
          delivery_url: "https://hook.example/notify",
          event_types: ["com.example.entity.updated"]
        }
      });
      return (res.body as { subscription_id: string }).subscription_id;
    };

    it("returns history for a subscriber catching up", async () => {
      const { server } = makeServer();
      for (const id of ["e1", "e2", "e3"]) await server.recordEvent(evt(id));

      const res = await server.getEventHistoryHandler()({
        method: "GET",
        path: "/eep/events",
        headers: {},
        query: { since: "e1" }
      });
      expect(res.status).toBe(200);
      const body = res.body as { events: Array<{ id: string }>; next_cursor?: string };
      expect(body.events.map((e) => e.id)).toEqual(["e2", "e3"]);
      expect(body.next_cursor).toBeUndefined();
    });

    // 410, not an empty 200: an empty page is indistinguishable from "you are
    // up to date", which would let a subscriber believe it caught up.
    it("returns 410 with the oldest retained id for an unsatisfiable cursor", async () => {
      const { server } = makeServer();
      await server.recordEvent(evt("e1"));
      const res = await server.getEventHistoryHandler()({
        method: "GET",
        path: "/eep/events",
        headers: {},
        query: { since: "evicted" }
      });
      expect(res.status).toBe(410);
      expect(res.body).toMatchObject({
        error: "retention_window_exceeded",
        oldest_retained_event_id: "e1"
      });
    });

    it("pages with next_cursor", async () => {
      const { server } = makeServer();
      for (const id of ["e1", "e2", "e3"]) await server.recordEvent(evt(id));
      const res = await server.getEventHistoryHandler()({
        method: "GET",
        path: "/eep/events",
        headers: {},
        query: { limit: "2" }
      });
      const body = res.body as { events: Array<{ id: string }>; next_cursor?: string };
      expect(body.events).toHaveLength(2);
      expect(body.next_cursor).toBe("e2");
    });

    it("re-publishes requested events and names the ones it cannot", async () => {
      const { server, bus } = makeServer();
      await server.recordEvent(evt("e1"));
      const id = await createSubscription(server);
      bus.published.length = 0;

      const res = await server.getRedeliverHandler()({
        method: "POST",
        path: `/eep/subscriptions/${id}/redeliver`,
        headers: {},
        params: { subscriptionId: id },
        body: { event_ids: ["e1", "gone"] }
      });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({ redelivered: ["e1"], unavailable: ["gone"] });
      // Redelivered events keep their original id so an already-processed
      // event is discarded by the ordinary idempotency rule.
      expect(bus.events.at(-1)).toMatchObject({ type: "com.example.entity.updated" });
    });

    it("rejects a redeliver request with no event ids", async () => {
      const { server } = makeServer();
      const id = await createSubscription(server);
      const res = await server.getRedeliverHandler()({
        method: "POST",
        path: `/eep/subscriptions/${id}/redeliver`,
        headers: {},
        params: { subscriptionId: id },
        body: { event_ids: [] }
      });
      expect(res.status).toBe(400);
    });

    it("rejects a redeliver request above the per-request cap", async () => {
      const { server } = makeServer();
      const id = await createSubscription(server);
      const res = await server.getRedeliverHandler()({
        method: "POST",
        path: `/eep/subscriptions/${id}/redeliver`,
        headers: {},
        params: { subscriptionId: id },
        body: { event_ids: Array.from({ length: 101 }, (_, i) => `e${i}`) }
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 when redelivering for an unknown subscription", async () => {
      const { server } = makeServer();
      const res = await server.getRedeliverHandler()({
        method: "POST",
        path: "/eep/subscriptions/nope/redeliver",
        headers: {},
        params: { subscriptionId: "nope" },
        body: { event_ids: ["e1"] }
      });
      expect(res.status).toBe(404);
    });

    it("exposes the delivery log for a subscription", async () => {
      const { server, store } = makeServer();
      const id = await createSubscription(server);
      await store.recordDelivery({
        subscription_id: id,
        event_id: "e1",
        attempt: 1,
        timestamp: new Date().toISOString(),
        status_code: 500,
        response_time_ms: 42,
        final_status: "failed"
      });

      const res = await server.getDeliveryLogHandler()({
        method: "GET",
        path: `/eep/subscriptions/${id}/delivery-log`,
        headers: {},
        params: { subscriptionId: id }
      });
      expect(res.status).toBe(200);
      const body = res.body as { attempts: Array<{ final_status: string }> };
      expect(body.attempts).toHaveLength(1);
      // This is what lets a subscriber tell "never sent" from "my endpoint
      // rejected it".
      expect(body.attempts[0]?.final_status).toBe("failed");
    });

    it("returns 404 for the delivery log of an unknown subscription", async () => {
      const { server } = makeServer();
      const res = await server.getDeliveryLogHandler()({
        method: "GET",
        path: "/eep/subscriptions/nope/delivery-log",
        headers: {},
        params: { subscriptionId: "nope" }
      });
      expect(res.status).toBe(404);
    });
  });

  // SPECIFICATION.md §3.2.1 — Layer 1 is the polled surface, and nothing
  // emitted ETag or honoured If-None-Match, so every poll re-downloaded the
  // whole document.
  describe("Layer 1 conditional requests (§3.2.1)", () => {
    const server = () =>
      new EEPServer({ baseUrl: "https://api.example.com", did: "did:web:example.com" });

    const layer1 = [
      {
        name: "manifest",
        call: (s: EEPServer, headers: Record<string, string | undefined>) =>
          s.getManifestHandler()({ method: "GET" as const, path: "/.well-known/eep.json", headers }),
        cacheControl: "public, max-age=300"
      },
      {
        name: "entity",
        call: (s: EEPServer, headers: Record<string, string | undefined>) =>
          s.getEntityHandler()({
            method: "GET" as const,
            path: "/u/u/alice",
            headers,
            params: { entityType: "u", entityId: "alice" }
          }),
        cacheControl: "public, max-age=60"
      },
      {
        name: "gates",
        call: (s: EEPServer, headers: Record<string, string | undefined>) =>
          s.getGatesHandler()({ method: "GET" as const, path: "/eep/gates", headers }),
        // Gate config describes who may access what; a shared cache must not
        // hand one agent's view to another.
        cacheControl: "private, max-age=60"
      },
      {
        name: "services",
        call: (s: EEPServer, headers: Record<string, string | undefined>) =>
          s.getServicesHandler()({ method: "GET" as const, path: "/eep/services", headers }),
        cacheControl: "public, max-age=60"
      }
    ];

    it.each(layer1)("$name emits ETag and Cache-Control", async ({ call, cacheControl }) => {
      const res = await call(server(), {});
      expect(res.status).toBe(200);
      expect(res.headers?.ETag).toMatch(/^"[A-Za-z0-9_-]+"$/);
      expect(res.headers?.["Cache-Control"]).toBe(cacheControl);
    });

    it.each(layer1)("$name returns 304 for a matching If-None-Match", async ({ call }) => {
      const s = server();
      const first = await call(s, {});
      const second = await call(s, { "if-none-match": first.headers!.ETag! });
      expect(second.status).toBe(304);
      expect(second.body).toBeNull();
      expect(second.headers?.ETag).toBe(first.headers!.ETag);
    });

    it.each(layer1)("$name returns a body for a stale validator", async ({ call }) => {
      const res = await call(server(), { "if-none-match": '"stale-validator"' });
      expect(res.status).toBe(200);
      expect(res.body).not.toBeNull();
    });

    // A validator that changes on every request is worse than none: the
    // client pays for the round-trip and still gets a body.
    it("emits the same ETag across repeated identical requests", async () => {
      const s = server();
      const a = await s.getManifestHandler()({ method: "GET", path: "/.well-known/eep.json", headers: {} });
      const b = await s.getManifestHandler()({ method: "GET", path: "/.well-known/eep.json", headers: {} });
      expect(a.headers?.ETag).toBe(b.headers?.ETag);
    });

    it("emits different ETags for different entities", async () => {
      const s = server();
      const alice = await s.getEntityHandler()({
        method: "GET", path: "/u/u/alice", headers: {}, params: { entityType: "u", entityId: "alice" }
      });
      const bob = await s.getEntityHandler()({
        method: "GET", path: "/u/u/bob", headers: {}, params: { entityType: "u", entityId: "bob" }
      });
      expect(alice.headers?.ETag).not.toBe(bob.headers?.ETag);
    });

    it("keeps the discovery Link header on entity responses", async () => {
      const res = await server().getEntityHandler()({
        method: "GET", path: "/u/u/alice", headers: {}, params: { entityType: "u", entityId: "alice" }
      });
      expect(res.headers?.Link).toContain('rel="subscribe"');
    });
  });

  // SPECIFICATION.md §10.2 — a subscription is time-bounded. `hub.lease_seconds`
  // was advertised during intent verification but never enforced, which made
  // it decorative: an abandoned delivery_url received traffic forever.
  describe("lease lifetime (§10.2)", () => {
    const makeServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        dbAdapter: db,
        eventBusAdapter: bus
      });
      return { db, bus, server };
    };

    const subscribe = async (server: EEPServer, extra: Record<string, unknown> = {}) =>
      server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          source_did: "did:web:agent.example",
          delivery_method: "webhook",
          delivery_url: "https://hook.example/notify",
          event_types: ["com.example.entity.updated"],
          ...extra
        }
      });

    it("grants the default 30-day lease when none is requested", async () => {
      const { server } = makeServer();
      const res = await subscribe(server);
      const body = res.body as { expires_at: string; created_at: string };
      const seconds = (Date.parse(body.expires_at) - Date.parse(body.created_at)) / 1000;
      expect(seconds).toBe(DEFAULT_LEASE_SECONDS);
    });

    it("honours a requested lease within policy", async () => {
      const { server } = makeServer();
      const res = await subscribe(server, { lease_seconds: 3600 });
      const body = res.body as { expires_at: string; created_at: string };
      expect((Date.parse(body.expires_at) - Date.parse(body.created_at)) / 1000).toBe(3600);
    });

    it("clamps a lease below the minimum rather than rejecting the subscription", async () => {
      const { server } = makeServer();
      const res = await subscribe(server, { lease_seconds: 1 });
      const body = res.body as { expires_at: string; created_at: string };
      expect(res.status).toBe(201);
      expect((Date.parse(body.expires_at) - Date.parse(body.created_at)) / 1000).toBe(MIN_LEASE_SECONDS);
    });

    it("clamps a lease above the maximum", async () => {
      const { server } = makeServer();
      const res = await subscribe(server, { lease_seconds: 99_999_999 });
      const body = res.body as { expires_at: string; created_at: string };
      expect((Date.parse(body.expires_at) - Date.parse(body.created_at)) / 1000).toBe(MAX_LEASE_SECONDS);
    });

    it("falls back to the default for a non-numeric lease", async () => {
      const { server } = makeServer();
      const res = await subscribe(server, { lease_seconds: "forever" });
      const body = res.body as { expires_at: string; created_at: string };
      expect(res.status).toBe(201);
      expect((Date.parse(body.expires_at) - Date.parse(body.created_at)) / 1000).toBe(DEFAULT_LEASE_SECONDS);
    });

    it("reports expires_at on the subscription representation", async () => {
      const { server } = makeServer();
      const created = await subscribe(server);
      const id = (created.body as { subscription_id: string }).subscription_id;
      const status = await server.getSubscriptionStatusHandler()({
        method: "GET",
        path: `/eep/subscriptions/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });
      expect(typeof (status.body as { expires_at?: string }).expires_at).toBe("string");
    });
  });

  // SPECIFICATION.md §5.1.1 — list / resume / test-delivery member operations.
  describe("subscription collection operations (§5.1.1)", () => {
    const makeServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        dbAdapter: db,
        eventBusAdapter: bus
      });
      return { db, bus, server };
    };

    const seed = async (db: RecordingDBAdapter, overrides: Partial<SubscriptionRecord> = {}) => {
      const record: SubscriptionRecord = {
        subscription_id: "sub_test_1",
        source_did: "did:web:agent.example",
        delivery_method: "webhook",
        callback_url: "https://hook.example/notify",
        event_types: ["com.example.entity.updated"],
        status: "active",
        failure_count: 0,
        delivery_secret: "whsec_super_secret_value_1234",
        created_at: new Date().toISOString(),
        ...overrides
      };
      await db.saveSubscription(record);
      return record;
    };

    it("lists subscriptions without ever re-exposing delivery_secret", async () => {
      const { db, server } = makeServer();
      await seed(db);
      const res = await server.getSubscriptionListHandler()({
        method: "GET",
        path: "/eep/subscriptions",
        headers: {}
      });
      expect(res.status).toBe(200);
      const body = res.body as { count: number; subscriptions: Array<Record<string, unknown>> };
      expect(body.count).toBe(1);
      expect(body.subscriptions[0]).not.toHaveProperty("delivery_secret");
      expect(body.subscriptions[0]?.subscription_id).toBe("sub_test_1");
    });

    it("resumes a paused subscription and clears its failure counter", async () => {
      const { db, server } = makeServer();
      await seed(db, { status: "paused", failure_count: 5 });
      const res = await server.getSubscriptionResumeHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/resume",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "active", failure_count: 0 });
      expect(res.body).not.toHaveProperty("delivery_secret");
      expect(db.rows[0]?.status).toBe("active");
      expect(db.rows[0]?.failure_count).toBe(0);
    });

    it("pauses an active subscription", async () => {
      const { db, server } = makeServer();
      await seed(db, { status: "active" });
      const res = await server.getSubscriptionPauseHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/pause",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "paused" });
      expect(res.body).not.toHaveProperty("delivery_secret");
      expect(db.rows[0]?.status).toBe("paused");
    });

    it("rejects pausing an already-paused subscription with 409", async () => {
      const { db, server } = makeServer();
      await seed(db, { status: "paused" });
      const res = await server.getSubscriptionPauseHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/pause",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(409);
    });

    it("rejects resuming an already-active subscription with 409", async () => {
      const { db, server } = makeServer();
      await seed(db, { status: "active" });
      const res = await server.getSubscriptionResumeHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/resume",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(409);
    });

    it("returns 404 when resuming an unknown subscription", async () => {
      const { server } = makeServer();
      const res = await server.getSubscriptionResumeHandler()({
        method: "POST",
        path: "/eep/subscriptions/nope/resume",
        headers: {},
        params: { subscriptionId: "nope" }
      });
      expect(res.status).toBe(404);
    });

    it("enqueues a test delivery addressed to exactly one subscription", async () => {
      const { db, bus, server } = makeServer();
      await seed(db);
      const res = await server.getSubscriptionTestHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/test",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(202);
      expect(bus.published).toEqual([TEST_DELIVERY_EVENT_TYPE]);
      expect(bus.events[0]?.data).toMatchObject({ subscription_id: "sub_test_1" });
    });

    it("refuses a test delivery for a paused subscription with 409", async () => {
      const { db, bus, server } = makeServer();
      await seed(db, { status: "paused" });
      const res = await server.getSubscriptionTestHandler()({
        method: "POST",
        path: "/eep/subscriptions/sub_test_1/test",
        headers: {},
        params: { subscriptionId: "sub_test_1" }
      });
      expect(res.status).toBe(409);
      expect(bus.published).toEqual([]);
    });

    it("returns 404 for a test delivery on an unknown subscription", async () => {
      const { bus, server } = makeServer();
      const res = await server.getSubscriptionTestHandler()({
        method: "POST",
        path: "/eep/subscriptions/nope/test",
        headers: {},
        params: { subscriptionId: "nope" }
      });
      expect(res.status).toBe(404);
      expect(bus.published).toEqual([]);
    });
  });

  describe("subscription status and unsubscribe", () => {
    const makeServer = () => {
      const db = new RecordingDBAdapter();
      const bus = new RecordingEventBusAdapter();
      const server = new EEPServer({
        baseUrl: "https://api.example.com",
        did: "did:web:example.com",
        dbAdapter: db,
        eventBusAdapter: bus
      });
      return { db, bus, server };
    };

    const createSubscription = async (server: EEPServer): Promise<string> => {
      const res = await server.getSubscribeHandler()({
        method: "POST",
        path: "/eep/subscribe",
        headers: {},
        body: {
          source_did: "did:web:agent.example",
          delivery_method: "webhook",
          delivery_url: "https://hook.example/notify",
          event_types: ["com.example.entity.updated"]
        }
      });
      return (res.body as { subscription_id: string }).subscription_id;
    };

    it("returns the subscription without delivery_secret on GET", async () => {
      const { server } = makeServer();
      const id = await createSubscription(server);

      const res = await server.getSubscriptionStatusHandler()({
        method: "GET",
        path: `/eep/subscribe/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty("delivery_secret");
      expect((res.body as { subscription_id: string }).subscription_id).toBe(id);
      expect((res.body as { status: string }).status).toBe("active");
    });

    it("returns 404 when GET targets an unknown id", async () => {
      const { server } = makeServer();
      const res = await server.getSubscriptionStatusHandler()({
        method: "GET",
        path: "/eep/subscribe/sub_missing",
        headers: {},
        params: { subscriptionId: "sub_missing" }
      });
      expect(res.status).toBe(404);
      expect((res.body as { error: string }).error).toBe("not_found");
    });

    it("returns 400 when GET has no subscription id param", async () => {
      const { server } = makeServer();
      const res = await server.getSubscriptionStatusHandler()({
        method: "GET",
        path: "/eep/subscribe/",
        headers: {}
      });
      expect(res.status).toBe(400);
    });

    it("cancels the subscription and publishes subscription.cancelled", async () => {
      const { server, db, bus } = makeServer();
      const id = await createSubscription(server);
      expect(db.rows.length).toBe(1);
      bus.published.length = 0;

      const res = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: `/eep/subscriptions/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });
      expect(res.status).toBe(204);
      expect(db.rows.length).toBe(0);
      expect(bus.published).toEqual(["subscription.cancelled"]);
      expect(bus.events.at(-1)?.data).toMatchObject({
        subscription_id: id,
        reason: expect.any(String)
      });
    });

    // §10.1: cancellation is idempotent. Returning 404 on the second DELETE
    // would tell a retrying client its own successful cancellation failed.
    it("returns 204 for an unknown id and publishes nothing", async () => {
      const { server, bus } = makeServer();
      const res = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: "/eep/subscriptions/sub_missing",
        headers: {},
        params: { subscriptionId: "sub_missing" }
      });
      expect(res.status).toBe(204);
      expect(bus.published).toEqual([]);
    });

    it("is idempotent across repeated cancellation", async () => {
      const { server, db, bus } = makeServer();
      const id = await createSubscription(server);
      bus.published.length = 0;

      const first = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: `/eep/subscriptions/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });
      const second = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: `/eep/subscriptions/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });

      expect(first.status).toBe(204);
      expect(second.status).toBe(204);
      expect(db.rows.length).toBe(0);
      // The lifecycle event fires once, for the transition that happened.
      expect(bus.published).toEqual(["subscription.cancelled"]);
    });

    it("returns 400 when DELETE has no subscription id param", async () => {
      const { server } = makeServer();
      const res = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: "/eep/subscribe/",
        headers: {}
      });
      expect(res.status).toBe(400);
    });
  });
});
