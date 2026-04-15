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
  });
});
