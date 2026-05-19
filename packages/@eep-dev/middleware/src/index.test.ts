import { describe, expect, it } from "vitest";
import * as middleware from "./index.js";

describe("middleware index exports", () => {
  it("exports public constructors", () => {
    expect(typeof middleware.EEPServer).toBe("function");
    expect(typeof middleware.createEEPRouter).toBe("function");
    expect(typeof middleware.createFastifyPlugin).toBe("function");
    expect(typeof middleware.createEEPApp).toBe("function");
    expect(typeof middleware.createEEPMiddleware).toBe("function");
    expect(typeof middleware.JWTAuthAdapter).toBe("function");
    expect(typeof middleware.APIKeyAuthAdapter).toBe("function");
    expect(typeof middleware.OAuthAuthAdapter).toBe("function");
    expect(typeof middleware.InMemoryEventBusAdapter).toBe("function");
    expect(typeof middleware.RedisEventBusAdapter).toBe("function");
    expect(typeof middleware.KafkaEventBusAdapter).toBe("function");
    expect(typeof middleware.InMemoryDBAdapter).toBe("function");
    expect(typeof middleware.PostgresDBAdapter).toBe("function");
    expect(typeof middleware.WebhookDispatcher).toBe("function");
  });

  it("exports the spec retry-schedule constants", () => {
    expect(Array.isArray(middleware.DEFAULT_RETRY_SCHEDULE_MS)).toBe(true);
    expect(middleware.DEFAULT_RETRY_SCHEDULE_MS).toHaveLength(7);
    expect(middleware.DEFAULT_PAUSE_AFTER_FAILURES).toBe(5);
    expect(middleware.DEFAULT_DELIVERY_TIMEOUT_MS).toBe(10_000);
  });
});
