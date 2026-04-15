import { describe, expect, it } from "vitest";
import { parseGateConfig, type GateProof, type ProofVerifier } from "@eep-dev/gates";
import { EEPServer } from "./eep-server.js";
import type { EventBusAdapter, DBAdapter, SubscriptionRecord } from "./request-handler.js";

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
        delivery_url: "https://hook.example/notify"
      }
    });
    expect(created.status).toBe(201);
    expect(db.rows.length).toBe(1);
    expect(bus.published).toEqual(["subscription.created"]);

    const audit = await server.getAuditLogHandler()({
      method: "GET",
      path: "/eep/audit-log",
      headers: {}
    });
    expect(audit.status).toBe(200);
    expect((audit.body as { subscriptions_count: number }).subscriptions_count).toBe(1);
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
        delivery_method: "sse"
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
    expect(routes.length).toBe(10);
    expect(routes.map((route) => route.operationId)).toContain("subscribe");
  });
});
