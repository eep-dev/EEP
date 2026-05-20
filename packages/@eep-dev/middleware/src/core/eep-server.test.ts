import { describe, expect, it, vi } from "vitest";
import { parseGateConfig, type GateProof, type ProofVerifier } from "@eep-dev/gates";
import { EEPServer } from "./eep-server.js";
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
  async publish(event: { type: string }): Promise<void> {
    this.published.push(event.type);
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
    expect(routes.length).toBe(12);
    const operationIds = routes.map((route) => route.operationId);
    expect(operationIds).toContain("subscribe");
    expect(operationIds).toContain("subscriptionStatus");
    expect(operationIds).toContain("unsubscribe");
  });

  describe("subscribe body validation", () => {
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
