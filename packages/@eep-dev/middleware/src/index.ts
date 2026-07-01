export { EEPServer, type EEPServerOptions } from "./core/eep-server.js";
export type {
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
} from "./core/request-handler.js";

export {
  WebhookDispatcher,
  DEFAULT_RETRY_SCHEDULE_MS,
  DEFAULT_PAUSE_AFTER_FAILURES,
  DEFAULT_DELIVERY_TIMEOUT_MS,
  type WebhookDispatcherOptions,
  type WebhookHttpClient,
  type WebhookHttpResponse,
  type DeliveryResult
} from "./dispatcher/webhook-dispatcher.js";

export { createEEPRouter } from "./adapters/express.js";
export { createFastifyPlugin } from "./adapters/fastify.js";
export { createEEPApp } from "./adapters/hono.js";
export { createEEPMiddleware } from "./adapters/koa.js";

export {
  JWTAuthAdapter,
  type JWTAuthAdapterOptions,
  type JWTVerifyTokenFn,
  type HmacAlgorithm
} from "./auth/jwt.js";
export { APIKeyAuthAdapter, type APIKeyResolver } from "./auth/api-key.js";
export {
  OAuthAuthAdapter,
  type OAuthAuthAdapterOptions,
  type OAuthIntrospectFn,
  type OAuthIntrospectionResult
} from "./auth/oauth.js";

export { InMemoryEventBusAdapter } from "./event-bus/in-memory.js";
export { RedisEventBusAdapter, type RedisClientLike } from "./event-bus/redis.js";
export { KafkaEventBusAdapter, type KafkaProducerLike, type KafkaConsumerLike } from "./event-bus/kafka.js";

export { InMemoryDBAdapter } from "./db/in-memory.js";
export { PostgresDBAdapter, type SQLClientLike } from "./db/postgres.js";
