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

export type SubscriptionRecord = {
  subscription_id: string;
  source_did: string;
  delivery_method: "sse" | "webhook";
  callback_url?: string;
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

export type DBAdapter = {
  saveSubscription: (subscription: SubscriptionRecord) => Promise<void>;
  getSubscription: (subscriptionId: string) => Promise<SubscriptionRecord | null>;
  listSubscriptions: () => Promise<SubscriptionRecord[]>;
};
