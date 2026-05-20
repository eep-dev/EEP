import { randomBytes } from "node:crypto";
import {
  build402Response,
  parseGateConfig,
  ProofVerifierRegistry,
  resolveAccess,
  type AccessRestrictionResponse,
  type GateConfig,
  type GateProof,
  type ProofVerifier
} from "@eep-dev/gates";
import { SSRFError, validateEventTypePattern, validateSSRF } from "@eep-dev/validator";
import type {
  AuthAdapter,
  CloudEvent,
  DBAdapter,
  EventBusAdapter,
  IncomingRequest,
  OutgoingResponse,
  RequestHandler,
  RouteDefinition,
  SubscriptionRecord,
  SubscriptionUpdate
} from "./request-handler.js";

export type EEPServerOptions = {
  baseUrl: string;
  did: string;
  gateConfig?: GateConfig;
  services?: Record<string, unknown>;
  eventTypes?: string[];
  authAdapter?: AuthAdapter;
  eventBusAdapter?: EventBusAdapter;
  dbAdapter?: DBAdapter;
  proofVerifiers?: ProofVerifier[];
};

class InMemoryDBAdapter implements DBAdapter {
  private readonly subscriptions = new Map<string, SubscriptionRecord>();

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    this.subscriptions.set(subscription.subscription_id, subscription);
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    return Array.from(this.subscriptions.values());
  }

  async updateSubscription(subscriptionId: string, updates: SubscriptionUpdate): Promise<void> {
    const existing = this.subscriptions.get(subscriptionId);
    if (existing) {
      this.subscriptions.set(subscriptionId, { ...existing, ...updates });
    }
  }

  async deleteSubscription(subscriptionId: string): Promise<boolean> {
    return this.subscriptions.delete(subscriptionId);
  }
}

class NullEventBusAdapter implements EventBusAdapter {
  async publish(_event: CloudEvent): Promise<void> {
    return Promise.resolve();
  }

  async subscribe(_pattern: string, _handler: (event: CloudEvent) => void): Promise<void> {
    return Promise.resolve();
  }
}

class HeaderProofAuthAdapter implements AuthAdapter {
  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    const raw = request.headers["x-eep-proofs"];
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as GateProof[];
    } catch {
      return [];
    }
  }
}

const DEFAULT_GATE_CONFIG = parseGateConfig({
  default_tier: "public",
  tiers: {
    public: {
      requirements: [],
      access: ["entity.public.profile", "eep.services.list"]
    }
  }
});

export class EEPServer {
  private readonly baseUrl: string;
  private readonly did: string;
  private readonly gateConfig: GateConfig;
  private readonly services: Record<string, unknown>;
  private readonly eventTypes: string[];
  private readonly authAdapter: AuthAdapter;
  private readonly dbAdapter: DBAdapter;
  private readonly eventBusAdapter: EventBusAdapter;
  private readonly verifierRegistry: ProofVerifierRegistry;

  constructor(options: EEPServerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.did = options.did;
    this.gateConfig = options.gateConfig ?? DEFAULT_GATE_CONFIG;
    this.services = options.services ?? { entity_did: this.did, services: [] };
    this.eventTypes = options.eventTypes ?? ["entity.updated"];
    this.authAdapter = options.authAdapter ?? new HeaderProofAuthAdapter();
    this.dbAdapter = options.dbAdapter ?? new InMemoryDBAdapter();
    this.eventBusAdapter = options.eventBusAdapter ?? new NullEventBusAdapter();
    this.verifierRegistry = new ProofVerifierRegistry();
    for (const verifier of options.proofVerifiers ?? []) {
      this.verifierRegistry.register(verifier);
    }
  }

  getManifestHandler(): RequestHandler {
    return async () => {
      return {
        status: 200,
        body: {
          did: this.did,
          eep_version: "0.1",
          layers: {
            layer1: `${this.baseUrl}/u/u/default`,
            layer2_sse: `${this.baseUrl}/eep/stream`,
            layer2_webhook: `${this.baseUrl}/eep/subscribe`,
            layer3_ws: `${this.baseUrl.replace(/^http/, "ws")}/eep/pulse`
          },
          supported_content_types: ["application/json", "text/markdown"],
          gates_url: `${this.baseUrl}/eep/gates`,
          services_url: `${this.baseUrl}/eep/services`,
          pqc_ready: false,
          x402_enabled: false
        }
      };
    };
  }

  getEntityHandler(): RequestHandler {
    return async (request) => {
      const entityType = request.params?.entityType ?? "u";
      const entityId = request.params?.entityId ?? "default";
      return {
        status: 200,
        headers: {
          "EEP-Version": "0.1",
          "EEP-Entity-DID": `${this.did}:${entityType}:${entityId}`,
          "Link": `<${this.baseUrl}/eep/subscribe>; rel="subscribe", <${this.baseUrl}/eep/stream?source=${entityId}>; rel="monitor"`
        },
        body: {
          id: entityId,
          type: entityType,
          did: `${this.did}:${entityType}:${entityId}`,
          eep: {
            version: "0.1",
            endpoint: `${this.baseUrl}/eep`,
            supported_delivery: ["webhook", "sse"]
          }
        }
      };
    };
  }

  getGatesHandler(): RequestHandler {
    return async () => ({ status: 200, body: this.gateConfig });
  }

  getServicesHandler(): RequestHandler {
    return async () => ({ status: 200, body: this.services });
  }

  getHealthHandler(): RequestHandler {
    return async () => ({ status: 200, body: { ok: true } });
  }

  getSSEHandler(): RequestHandler {
    return async () => ({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache"
      },
      body: {
        event: "eep.connected",
        data: {
          did: this.did,
          event_types: this.eventTypes
        }
      }
    });
  }

  getGatedResourceHandler(): RequestHandler {
    return async (request) => {
      const resource = request.params?.resourcePath ?? "entity.public.profile";
      const proofs = await this.authAdapter.extractProofs(request);
      const access = await resolveAccess(proofs, this.gateConfig, resource, this.verifierRegistry, {
        strictSemanticVerification: true
      });

      if (!access.granted) {
        const payload = await build402Response(this.gateConfig, resource, proofs);
        return { status: 402, body: payload };
      }

      return {
        status: 200,
        body: {
          resource,
          tier: access.tier,
          data: { value: "access_granted" }
        }
      };
    };
  }

  getSubscribeHandler(): RequestHandler {
    return async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const sourceDid = typeof body.source_did === "string" ? body.source_did : "";
      const deliveryMethod =
        body.delivery_method === "sse" || body.delivery_method === "webhook" ? body.delivery_method : "";
      if (!sourceDid || !deliveryMethod) {
        return {
          status: 400,
          body: { error: "invalid_request", message: "source_did and delivery_method are required" }
        };
      }

      // event_types: required, at least one entry, each must match the EEP pattern
      const rawEventTypes = Array.isArray(body.event_types)
        ? body.event_types.filter((e): e is string => typeof e === "string")
        : [];
      if (rawEventTypes.length === 0) {
        return {
          status: 400,
          body: { error: "invalid_request", message: "event_types must be a non-empty array of strings" }
        };
      }
      const badPattern = rawEventTypes.find((p) => !validateEventTypePattern(p));
      if (badPattern !== undefined) {
        return {
          status: 400,
          body: {
            error: "invalid_request",
            message: `event_types contains an invalid pattern: "${badPattern}". Patterns must be dot-separated lowercase segments, optionally ending with .*`
          }
        };
      }

      // delivery_url: required for webhook, must pass SSRF check
      const deliveryUrl = typeof body.delivery_url === "string" ? body.delivery_url : undefined;
      if (deliveryMethod === "webhook") {
        if (!deliveryUrl) {
          return {
            status: 400,
            body: { error: "invalid_request", message: "delivery_url is required when delivery_method is webhook" }
          };
        }
        try {
          await validateSSRF(deliveryUrl);
        } catch (err) {
          if (err instanceof SSRFError) {
            return {
              status: 400,
              body: { error: "invalid_request", message: `delivery_url is not allowed: ${err.message}` }
            };
          }
          return {
            status: 400,
            body: { error: "invalid_request", message: "delivery_url could not be validated" }
          };
        }
      }

      // metadata: pass through if it's a string-keyed object with string values
      const rawMeta = body.metadata;
      const metadata: Record<string, string> | undefined =
        rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
          ? (Object.fromEntries(
              Object.entries(rawMeta as Record<string, unknown>).filter(([, v]) => typeof v === "string")
            ) as Record<string, string>)
          : undefined;

      const tier = typeof body.tier === "string" ? body.tier : undefined;

      // gate_proofs: validate against the requested tier's requirements. Body-supplied
      // proofs are merged with any header-supplied proofs from the auth adapter, so
      // either source (or both) can satisfy the tier.
      if (tier !== undefined) {
        const tierConfig = this.gateConfig.tiers[tier];
        if (!tierConfig) {
          return {
            status: 400,
            body: { error: "invalid_request", message: `unknown tier: "${tier}"` }
          };
        }
        const requiresGateCheck = tier !== this.gateConfig.default_tier && tierConfig.requirements.length > 0;
        if (requiresGateCheck) {
          const sentinelResource = tierConfig.access[0];
          // Degenerate tier with no resources to grant — nothing to verify against.
          if (sentinelResource) {
            const bodyProofs = Array.isArray(body.gate_proofs)
              ? body.gate_proofs.filter((p): p is GateProof => !!p && typeof p === "object" && typeof (p as { type?: unknown }).type === "string")
              : [];
            const headerProofs = await this.authAdapter.extractProofs(request);
            const proofs = [...headerProofs, ...bodyProofs];
            const access = await resolveAccess(proofs, this.gateConfig, sentinelResource, this.verifierRegistry, {
              strictSemanticVerification: true
            });
            if (!access.granted) {
              const payload: AccessRestrictionResponse = await build402Response(this.gateConfig, sentinelResource, proofs);
              return { status: 402, body: payload };
            }
          }
        }
      }

      // A per-subscription HMAC secret used to sign webhook deliveries.
      // Returned to the subscriber once, on creation, and never again.
      const deliverySecret = deliveryMethod === "webhook" ? randomBytes(24).toString("base64url") : undefined;

      const subscription: SubscriptionRecord = {
        subscription_id: `sub_${Date.now()}`,
        source_did: sourceDid,
        delivery_method: deliveryMethod,
        callback_url: deliveryUrl,
        event_types: rawEventTypes,
        status: "active",
        failure_count: 0,
        delivery_secret: deliverySecret,
        metadata,
        tier,
        created_at: new Date().toISOString()
      };

      await this.dbAdapter.saveSubscription(subscription);

      await this.eventBusAdapter.publish({
        id: `evt_${Date.now()}`,
        type: "subscription.created",
        source: this.did,
        time: new Date().toISOString(),
        data: subscription as unknown as Record<string, unknown>
      });

      return {
        status: 201,
        body: subscription
      };
    };
  }

  getSubscriptionStatusHandler(): RequestHandler {
    return async (request) => {
      const subscriptionId = request.params?.subscriptionId;
      if (!subscriptionId) {
        return {
          status: 400,
          body: { error: "invalid_request", message: "subscription_id is required" }
        };
      }
      const subscription = await this.dbAdapter.getSubscription(subscriptionId);
      if (!subscription) {
        return {
          status: 404,
          body: { error: "not_found", message: `subscription ${subscriptionId} does not exist` }
        };
      }
      // delivery_secret is returned only once, at creation time.
      const { delivery_secret: _secret, ...safe } = subscription;
      return { status: 200, body: safe };
    };
  }

  getUnsubscribeHandler(): RequestHandler {
    return async (request) => {
      const subscriptionId = request.params?.subscriptionId;
      if (!subscriptionId) {
        return {
          status: 400,
          body: { error: "invalid_request", message: "subscription_id is required" }
        };
      }
      const deleted = await this.dbAdapter.deleteSubscription(subscriptionId);
      if (!deleted) {
        return {
          status: 404,
          body: { error: "not_found", message: `subscription ${subscriptionId} does not exist` }
        };
      }
      await this.eventBusAdapter.publish({
        id: `evt_${Date.now()}`,
        type: "subscription.deleted",
        source: this.did,
        time: new Date().toISOString(),
        data: { subscription_id: subscriptionId }
      });
      return { status: 204, body: null };
    };
  }

  getAuditLogHandler(): RequestHandler {
    return async () => {
      const subscriptions = await this.dbAdapter.listSubscriptions();
      // Never expose delivery_secret beyond the one-time creation response.
      const redacted = subscriptions.map(({ delivery_secret: _secret, ...rest }) => rest);
      return {
        status: 200,
        body: {
          subscriptions_count: redacted.length,
          subscriptions: redacted
        }
      };
    };
  }

  getPulseUpgradeHandler(): RequestHandler {
    return async () => ({
      status: 426,
      body: {
        error: "upgrade_required",
        message: "Use a WebSocket upgrade request for /eep/pulse"
      }
    });
  }

  get402Handler(resource: string, proofs: GateProof[]): Promise<OutgoingResponse> {
    return build402Response(this.gateConfig, resource, proofs).then((body) => ({
      status: 402,
      body
    }));
  }

  getRouteDefinitions(): RouteDefinition[] {
    return [
      { method: "GET", path: "/.well-known/eep.json", operationId: "manifest", handler: this.getManifestHandler() },
      { method: "GET", path: "/u/:entityType/:entityId", operationId: "entity", handler: this.getEntityHandler() },
      { method: "GET", path: "/eep/gates", operationId: "gates", handler: this.getGatesHandler() },
      { method: "GET", path: "/eep/services", operationId: "services", handler: this.getServicesHandler() },
      { method: "GET", path: "/healthz", operationId: "health", handler: this.getHealthHandler() },
      { method: "GET", path: "/eep/stream", operationId: "stream", handler: this.getSSEHandler() },
      { method: "GET", path: "/eep/content/:resourcePath", operationId: "gatedContent", handler: this.getGatedResourceHandler() },
      { method: "POST", path: "/eep/subscribe", operationId: "subscribe", handler: this.getSubscribeHandler() },
      { method: "GET", path: "/eep/subscribe/:subscriptionId", operationId: "subscriptionStatus", handler: this.getSubscriptionStatusHandler() },
      { method: "DELETE", path: "/eep/subscribe/:subscriptionId", operationId: "unsubscribe", handler: this.getUnsubscribeHandler() },
      { method: "GET", path: "/eep/audit-log", operationId: "auditLog", handler: this.getAuditLogHandler() },
      { method: "GET", path: "/eep/pulse", operationId: "pulseUpgrade", handler: this.getPulseUpgradeHandler() }
    ];
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.dbAdapter.getSubscription(subscriptionId);
  }

  async subscribeToEvents(pattern: string, handler: (event: CloudEvent) => void): Promise<void> {
    await this.eventBusAdapter.subscribe(pattern, handler);
  }
}
