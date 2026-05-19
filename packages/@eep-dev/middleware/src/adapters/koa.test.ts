import { describe, expect, it } from "vitest";
import { createEEPMiddleware } from "./koa.js";

describe("createEEPMiddleware", () => {
  it("builds koa-like route handlers", async () => {
    const middleware = createEEPMiddleware({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });
    const route = middleware.routes.find((item) => item.operationId === "entity");
    const response = await route!.execute({
      method: "GET",
      path: "/u/u/alice",
      headers: {},
      params: {
        entityType: "u",
        entityId: "alice"
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers?.["EEP-Version"]).toBe("0.1");

    const health = middleware.routes.find((item) => item.operationId === "health");
    const fallback = await health!.execute({});
    expect(fallback.status).toBe(200);

    const subscribe = middleware.routes.find((item) => item.operationId === "subscribe");
    const created = await subscribe!.execute({
      method: "POST",
      request: {
        body: {
          source_did: "did:web:agent.example",
          delivery_method: "sse",
          event_types: ["com.example.*"]
        }
      }
    });
    expect(created.status).toBe(201);
  });
});
