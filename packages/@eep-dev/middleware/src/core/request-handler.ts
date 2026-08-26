import type { GateProof } from "@eep-dev/gates";

export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type IncomingRequest = {
  method: HTTPMethod;
  path: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

export type OutgoingResponse = {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

export type RequestHandler = (request: IncomingRequest) => Promise<OutgoingResponse>;

export type RouteDefinition = {
  method: HTTPMethod;
  path: string;
  handler: RequestHandler;
  operationId: string;
};

/**
 * Event type emitted by `POST /eep/subscriptions/:id/test` (SPECIFICATION.md
 * §5.1.1). `WebhookDispatcher` routes it to the single subscription named in
 * `data.subscription_id` instead of fanning it out by `event_types`, so a
 * conformance probe can exercise the signed delivery path on demand.
 */
export const TEST_DELIVERY_EVENT_TYPE = "com.eep.subscription.test";

/**
 * Subscription lifecycle states (SPECIFICATION.md §10).
 *
 * `rejected`, `expired` and `cancelled` are terminal: a subscription in one of
 * them never delivers again and its id is not reusable.
 */
export type SubscriptionStatus =
  | "pending_verification"
  | "active"
  | "paused"
  | "rejected"
  | "expired"
  | "cancelled";

/** States in which a publisher MUST NOT deliver events. */
export const TERMINAL_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "rejected",
  "expired",
  "cancelled",
];

/** Default lease granted when the subscriber does not request one: 30 days. */
export const DEFAULT_LEASE_SECONDS = 2_592_000;

/** Bounds a publisher will clamp a requested `lease_seconds` into. */
export const MIN_LEASE_SECONDS = 300;
export const MAX_LEASE_SECONDS = 31_536_000;

export type SubscriptionRecord = {
  subscription_id: string;
  source_did: string;
  delivery_method: "sse" | "webhook";
  callback_url?: string;
  event_types: string[];
  status: SubscriptionStatus;
  failure_count: number;
  /**
   * RFC 3339 timestamp at which the lease elapses (SPECIFICATION.md §10.2).
   * A subscription past this instant MUST NOT receive deliveries; it moves to
   * `expired`. Absent means the publisher grants an unbounded lease.
   */
  expires_at?: string;
  /** Per-subscription HMAC secret returned to the subscriber on creation. */
  delivery_secret?: string;
  /** Subscriber-defined metadata (passed through, not interpreted). */
  metadata?: Record<string, string>;
  /** Requested access tier; matched against gate config on delivery. */
  tier?: string;
  created_at: string;
};

export type CloudEvent = {
  id: string;
  type: string;
  source: string;
  time: string;
  data: Record<string, unknown>;
};

export type AuthAdapter = {
  extractProofs: (request: IncomingRequest) => Promise<GateProof[]>;
};

export type EventBusAdapter = {
  publish: (event: CloudEvent) => Promise<void>;
  subscribe: (pattern: string, handler: (event: CloudEvent) => void) => Promise<void>;
};

export type SubscriptionUpdate = Partial<
  Pick<SubscriptionRecord, "status" | "failure_count" | "expires_at">
>;

export type DBAdapter = {
  saveSubscription: (subscription: SubscriptionRecord) => Promise<void>;
  getSubscription: (subscriptionId: string) => Promise<SubscriptionRecord | null>;
  listSubscriptions: () => Promise<SubscriptionRecord[]>;
  updateSubscription: (subscriptionId: string, updates: SubscriptionUpdate) => Promise<void>;
  /** Remove a subscription. Resolves to true if a row was deleted, false if no such id existed. */
  deleteSubscription: (subscriptionId: string) => Promise<boolean>;
};
