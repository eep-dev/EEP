import { describe, expect, it, vi } from "vitest";
import { parseGateConfig, type GateProof, type ProofVerifier } from "@eep-dev/gates";
import { EEPServer } from "./eep-server.js";
import { TEST_DELIVERY_EVENT_TYPE } from "./request-handler.js";
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
    expect(routes.length).toBe(18);
    const operationIds = routes.map((route) => route.operationId);
    expect(operationIds).toContain("subscribe");
    expect(operationIds).toContain("subscriptionStatus");
    expect(operationIds).toContain("unsubscribe");
    expect(operationIds).toContain("listSubscriptions");
    expect(operationIds).toContain("resumeSubscription");
    expect(operationIds).toContain("pauseSubscription");
    expect(operationIds).toContain("testSubscriptionDelivery");
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

    it("deletes the subscription and publishes subscription.deleted", async () => {
      const { server, db, bus } = makeServer();
      const id = await createSubscription(server);
      expect(db.rows.length).toBe(1);
      bus.published.length = 0;

      const res = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: `/eep/subscribe/${id}`,
        headers: {},
        params: { subscriptionId: id }
      });
      expect(res.status).toBe(204);
      expect(db.rows.length).toBe(0);
      expect(bus.published).toEqual(["subscription.deleted"]);
    });

    it("returns 404 when DELETE targets an unknown id and skips publish", async () => {
      const { server, bus } = makeServer();
      const res = await server.getUnsubscribeHandler()({
        method: "DELETE",
        path: "/eep/subscribe/sub_missing",
        headers: {},
        params: { subscriptionId: "sub_missing" }
      });
      expect(res.status).toBe(404);
      expect(bus.published).toEqual([]);
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
