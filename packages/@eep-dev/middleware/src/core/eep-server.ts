import { randomBytes } from "node:crypto";
import {
  build402Response,
  parseGateConfig,
  ProofVerifierRegistry,
  resolveAccess,
  type AccessRestrictionResponse,
  type GateConfig,
  type GateProof,
  type ProofVerifier,
  PROBLEM_JSON_CONTENT_TYPE
} from "@eep-dev/gates";
import { SSRFError, validateEventTypePattern, validateSSRF } from "@eep-dev/validator";
import { withConditional } from "./conditional.js";
import { validateFilter, FilterValidationError, type EventFilter } from "./event-filter.js";
import {
  InMemoryEventStore,
  RetentionWindowExceededError,
  clampLimit,
  type EventStore
} from "./event-store.js";
import {
  TEST_DELIVERY_EVENT_TYPE,
  DEFAULT_LEASE_SECONDS,
  MIN_LEASE_SECONDS,
  MAX_LEASE_SECONDS
} from "./request-handler.js";
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
  /**
   * Retained event history and delivery log (SPECIFICATION.md §5.1.2).
   * Defaults to an in-process store; back it with durable storage to
   * survive a restart.
   */
  eventStore?: EventStore;
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

/**
 * Clamp a requested `lease_seconds` into publisher policy (§10.2).
 *
 * A non-integer, out-of-range or absent value falls back to the default rather
 * than being rejected: the lease is the publisher's to grant, and a subscriber
 * asking for something unreasonable should still get a working subscription
 * with an honest `expires_at`.
 */
function clampLeaseSeconds(requested: unknown): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return DEFAULT_LEASE_SECONDS;
  }
  const seconds = Math.floor(requested);
  if (seconds < MIN_LEASE_SECONDS) return MIN_LEASE_SECONDS;
  if (seconds > MAX_LEASE_SECONDS) return MAX_LEASE_SECONDS;
  return seconds;
}

/** Per-request cap on redelivery ids (§5.1.2). */
const MAX_REDELIVER_IDS = 100;

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
  private readonly eventStore: EventStore;

  constructor(options: EEPServerOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.did = options.did;
    this.gateConfig = options.gateConfig ?? DEFAULT_GATE_CONFIG;
    this.services = options.services ?? { entity_did: this.did, services: [] };
    this.eventTypes = options.eventTypes ?? ["entity.updated"];
    this.authAdapter = options.authAdapter ?? new HeaderProofAuthAdapter();
    this.dbAdapter = options.dbAdapter ?? new InMemoryDBAdapter();
    this.eventBusAdapter = options.eventBusAdapter ?? new NullEventBusAdapter();
    this.eventStore = options.eventStore ?? new InMemoryEventStore();
    this.verifierRegistry = new ProofVerifierRegistry();
    for (const verifier of options.proofVerifiers ?? []) {
      this.verifierRegistry.register(verifier);
    }
  }

  getManifestHandler(): RequestHandler {
    return async (request) => {
      const response: OutgoingResponse = {
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
          // §12.3.2 — declare what this publisher emits so an agent does not
          // have to subscribe to a wildcard and find out empirically.
          event_types: this.eventTypes.map((type) => ({ type })),
          gates_url: `${this.baseUrl}/eep/gates`,
          services_url: `${this.baseUrl}/eep/services`,
          pqc_ready: false,
          x402_enabled: false
        }
      };
      // §3.2.1 — the manifest is the most-polled and least-volatile Layer 1
      // document, so it is the one that benefits most from a 304.
      return withConditional(response, request.headers, {
        cacheControl: "public, max-age=300"
      });
    };
  }

  getEntityHandler(): RequestHandler {
    return async (request) => {
      const entityType = request.params?.entityType ?? "u";
      const entityId = request.params?.entityId ?? "default";
      const response: OutgoingResponse = {
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
      return withConditional(response, request.headers, {
        cacheControl: "public, max-age=60"
      });
    };
  }

  getGatesHandler(): RequestHandler {
    return async (request) =>
      withConditional({ status: 200, body: this.gateConfig }, request.headers, {
        // Gate config describes who may access what. `private` keeps a shared
        // cache from handing one agent's view to another.
        cacheControl: "private, max-age=60"
      });
  }

  getServicesHandler(): RequestHandler {
    return async (request) =>
      withConditional({ status: 200, body: this.services }, request.headers, {
        cacheControl: "public, max-age=60"
      });
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
        return { status: 402, headers: { "Content-Type": PROBLEM_JSON_CONTENT_TYPE }, body: payload };
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
              return { status: 402, headers: { "Content-Type": PROBLEM_JSON_CONTENT_TYPE }, body: payload };
            }
          }
        }
      }

      // §5.1.3 — reject a malformed filter rather than accepting and ignoring
      // it. A subscriber that believes it is filtering, but is not, receives
      // traffic it thought it had asked to be spared and cannot tell from its
      // own side.
      let filter: EventFilter | undefined;
      if (body.filter !== undefined) {
        try {
          filter = validateFilter(body.filter);
        } catch (err) {
          if (err instanceof FilterValidationError) {
            return { status: 400, body: { error: "invalid_request", message: err.message } };
          }
          throw err;
        }
      }

      // A per-subscription HMAC secret used to sign webhook deliveries.
      // Returned to the subscriber once, on creation, and never again.
      const deliverySecret = deliveryMethod === "webhook" ? randomBytes(24).toString("base64url") : undefined;

      // Subscriptions are time-bounded (§10.2). A subscriber MAY request a
      // lease; the publisher clamps it to policy and reports what it actually
      // granted as `expires_at`. Advertising a lease and not enforcing it is
      // what made `hub.lease_seconds` decorative.
      const leaseSeconds = clampLeaseSeconds(body.lease_seconds);
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + leaseSeconds * 1000);

      const subscription: SubscriptionRecord = {
        subscription_id: `sub_${Date.now()}`,
        source_did: sourceDid,
        delivery_method: deliveryMethod,
        callback_url: deliveryUrl,
        event_types: rawEventTypes,
        status: "active",
        failure_count: 0,
        expires_at: expiresAt.toISOString(),
        ...(filter ? { filter } : {}),
        ...(body.delivery_format === "cloudevents/v1.0-binary"
          ? { delivery_format: "cloudevents/v1.0-binary" as const }
          : {}),
        delivery_secret: deliverySecret,
        metadata,
        tier,
        created_at: createdAt.toISOString()
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

  /**
   * `GET /eep/subscriptions` — list the caller's subscriptions (§5.1.1).
   *
   * `delivery_secret` is stripped: it is disclosed exactly once, in the
   * creation response.
   */
  getSubscriptionListHandler(): RequestHandler {
    return async () => {
      const subscriptions = await this.dbAdapter.listSubscriptions();
      const safe = subscriptions.map(({ delivery_secret: _secret, ...rest }) => rest);
      return { status: 200, body: { subscriptions: safe, count: safe.length } };
    };
  }

  /**
   * `POST /eep/subscriptions/:subscriptionId/pause` — stop delivering to an
   * `active` subscription without cancelling it (§5.1.1, §10).
   */
  getSubscriptionPauseHandler(): RequestHandler {
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
      if (subscription.status === "paused") {
        return {
          status: 409,
          body: { error: "conflict", message: `subscription ${subscriptionId} is already paused` }
        };
      }
      await this.dbAdapter.updateSubscription(subscriptionId, { status: "paused" });
      const updated = await this.dbAdapter.getSubscription(subscriptionId);
      const { delivery_secret: _secret, ...safe } = updated ?? subscription;
      return { status: 200, body: { ...safe, status: "paused" } };
    };
  }

  /**
   * `POST /eep/subscriptions/:subscriptionId/resume` — move a `paused`
   * subscription back to `active` and clear its failure counter (§5.1.1, §10).
   */
  getSubscriptionResumeHandler(): RequestHandler {
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
      if (subscription.status === "active") {
        return {
          status: 409,
          body: {
            error: "conflict",
            message: `subscription ${subscriptionId} is already active`
          }
        };
      }
      await this.dbAdapter.updateSubscription(subscriptionId, {
        status: "active",
        failure_count: 0
      });
      const updated = await this.dbAdapter.getSubscription(subscriptionId);
      const { delivery_secret: _secret, ...safe } = updated ?? subscription;
      return { status: 200, body: { ...safe, status: "active", failure_count: 0 } };
    };
  }

  /**
   * `POST /eep/subscriptions/:subscriptionId/test` — enqueue a synthetic,
   * fully signed delivery to the subscription's registered `delivery_url`
   * (§5.1.1).
   *
   * This is what makes a publisher's delivery path independently checkable:
   * `@eep-dev/compliance-cli` calls it to verify Standard Webhooks headers
   * and HMAC correctness without waiting for organic traffic. The event is
   * published on the normal event bus; `WebhookDispatcher` routes
   * `com.eep.subscription.test` to the single subscription named in
   * `data.subscription_id` rather than fanning it out by `event_types`.
   */
  getSubscriptionTestHandler(): RequestHandler {
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
      if (subscription.status !== "active") {
        return {
          status: 409,
          body: {
            error: "conflict",
            message: `subscription ${subscriptionId} is ${subscription.status}; test deliveries require an active subscription`
          }
        };
      }

      const event: CloudEvent = {
        id: `evt_test_${randomBytes(8).toString("hex")}`,
        type: TEST_DELIVERY_EVENT_TYPE,
        source: this.did,
        time: new Date().toISOString(),
        data: {
          subscription_id: subscriptionId,
          message: "EEP synthetic test delivery — no state changed."
        }
      };
      await this.eventBusAdapter.publish(event);

      return {
        status: 202,
        body: { status: "accepted", subscription_id: subscriptionId, event_id: event.id }
      };
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
      // §10.1: cancellation is idempotent. A second DELETE of an
      // already-cancelled subscription returns 204, not 404, so a retrying
      // client converges instead of treating its own success as a failure.
      const deleted = await this.dbAdapter.deleteSubscription(subscriptionId);
      if (deleted) {
        await this.eventBusAdapter.publish({
          id: `evt_${Date.now()}`,
          type: "subscription.cancelled",
          source: this.did,
          time: new Date().toISOString(),
          data: { subscription_id: subscriptionId, reason: "cancelled_by_subscriber" }
        });
      }
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
      headers: { "Content-Type": PROBLEM_JSON_CONTENT_TYPE },
      body
    }));
  }


  /**
   * `GET /eep/events` — event history for catch-up (§5.1.2).
   *
   * This is what a webhook subscriber uses after an outage: SSE has
   * `Last-Event-ID` and Layer 3 has `system`/`replay`, and webhooks had
   * nothing, so resuming a `paused` subscription silently lost the events
   * from the outage that caused the pause.
   */
  getEventHistoryHandler(): RequestHandler {
    return async (request) => {
      const query = request.query ?? {};
      const limitRaw = query.limit === undefined ? undefined : Number.parseInt(query.limit, 10);
      try {
        const page = await this.eventStore.history({
          source: query.source,
          since: query.since,
          until: query.until,
          limit: clampLimit(limitRaw)
        });
        return { status: 200, body: page };
      } catch (err) {
        if (err instanceof RetentionWindowExceededError) {
          // 410, not an empty page: an empty page is indistinguishable from
          // "you are up to date", which would let the subscriber believe it
          // caught up while silently losing events.
          return {
            status: 410,
            body: {
              error: "retention_window_exceeded",
              message: err.message,
              oldest_retained_event_id: err.oldestRetainedId
            }
          };
        }
        throw err;
      }
    };
  }

  /**
   * `POST /eep/subscriptions/:subscriptionId/redeliver` — re-send specific
   * events (§5.1.2).
   *
   * Redelivered events keep their original `id` so a subscriber that already
   * processed one discards it by the ordinary idempotency rule rather than
   * double-processing.
   */
  getRedeliverHandler(): RequestHandler {
    return async (request) => {
      const subscriptionId = request.params?.subscriptionId;
      if (!subscriptionId) {
        return { status: 400, body: { error: "invalid_request", message: "subscription_id is required" } };
      }
      const subscription = await this.dbAdapter.getSubscription(subscriptionId);
      if (!subscription) {
        return { status: 404, body: { error: "not_found", message: `subscription ${subscriptionId} does not exist` } };
      }

      const body = (request.body ?? {}) as { event_ids?: unknown };
      const ids = Array.isArray(body.event_ids)
        ? body.event_ids.filter((id): id is string => typeof id === "string")
        : [];
      if (ids.length === 0) {
        return { status: 400, body: { error: "invalid_request", message: "event_ids must be a non-empty array of event ids" } };
      }
      if (ids.length > MAX_REDELIVER_IDS) {
        return {
          status: 400,
          body: {
            error: "invalid_request",
            message: `event_ids exceeds the per-request cap of ${MAX_REDELIVER_IDS}`
          }
        };
      }

      const events = await this.eventStore.getByIds(ids);
      const found = new Set(events.map((e) => e.id));
      const missing = ids.filter((id) => !found.has(id));

      for (const event of events) {
        await this.eventBusAdapter.publish(event);
      }

      return {
        status: 202,
        body: {
          status: "accepted",
          subscription_id: subscriptionId,
          redelivered: events.map((e) => e.id),
          // Named explicitly rather than silently dropped: an id outside the
          // retention window is something the subscriber needs to know about.
          unavailable: missing
        }
      };
    };
  }

  /** `GET /eep/subscriptions/:subscriptionId/delivery-log` (§5.1.2). */
  getDeliveryLogHandler(): RequestHandler {
    return async (request) => {
      const subscriptionId = request.params?.subscriptionId;
      if (!subscriptionId) {
        return { status: 400, body: { error: "invalid_request", message: "subscription_id is required" } };
      }
      const subscription = await this.dbAdapter.getSubscription(subscriptionId);
      if (!subscription) {
        return { status: 404, body: { error: "not_found", message: `subscription ${subscriptionId} does not exist` } };
      }
      const limitRaw = request.query?.limit;
      const entries = await this.eventStore.deliveryLog(
        subscriptionId,
        limitRaw === undefined ? undefined : Number.parseInt(limitRaw, 10)
      );
      return { status: 200, body: { subscription_id: subscriptionId, attempts: entries } };
    };
  }

  /** Record an event in history so it is available for catch-up (§5.1.2). */
  async recordEvent(event: CloudEvent): Promise<void> {
    await this.eventStore.append(event);
  }

  /** The store backing history and the delivery log. */
  getEventStore(): EventStore {
    return this.eventStore;
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
      // Subscription resource per SPECIFICATION.md §5.1.1. Creation stays on
      // `POST /eep/subscribe` because that URL is what the manifest advertises
      // as `layers.layer2_webhook` and what the `rel="subscribe"` Link header
      // points at. Every member operation lives under `/eep/subscriptions`.
      { method: "POST", path: "/eep/subscribe", operationId: "subscribe", handler: this.getSubscribeHandler() },
      { method: "GET", path: "/eep/subscriptions", operationId: "listSubscriptions", handler: this.getSubscriptionListHandler() },
      { method: "GET", path: "/eep/subscriptions/:subscriptionId", operationId: "subscriptionStatus", handler: this.getSubscriptionStatusHandler() },
      { method: "DELETE", path: "/eep/subscriptions/:subscriptionId", operationId: "unsubscribe", handler: this.getUnsubscribeHandler() },
      { method: "POST", path: "/eep/subscriptions/:subscriptionId/pause", operationId: "pauseSubscription", handler: this.getSubscriptionPauseHandler() },
      { method: "POST", path: "/eep/subscriptions/:subscriptionId/resume", operationId: "resumeSubscription", handler: this.getSubscriptionResumeHandler() },
      { method: "POST", path: "/eep/subscriptions/:subscriptionId/test", operationId: "testSubscriptionDelivery", handler: this.getSubscriptionTestHandler() },

      // Deprecated 0.1.x aliases for the member operations, which shipped
      // under `/eep/subscribe/:id` before §5.1.1 existed. Remove at 0.2.
      { method: "GET", path: "/eep/subscribe/:subscriptionId", operationId: "subscriptionStatusDeprecated", handler: this.getSubscriptionStatusHandler() },
      { method: "DELETE", path: "/eep/subscribe/:subscriptionId", operationId: "unsubscribeDeprecated", handler: this.getUnsubscribeHandler() },
      { method: "GET", path: "/eep/events", operationId: "eventHistory", handler: this.getEventHistoryHandler() },
      { method: "POST", path: "/eep/subscriptions/:subscriptionId/redeliver", operationId: "redeliver", handler: this.getRedeliverHandler() },
      { method: "GET", path: "/eep/subscriptions/:subscriptionId/delivery-log", operationId: "deliveryLog", handler: this.getDeliveryLogHandler() },
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
