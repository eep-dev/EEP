import { describe, expect, it } from "vitest";
import { createFastifyPlugin } from "./fastify.js";

describe("createFastifyPlugin", () => {
  it("creates fastify-like route definitions", async () => {
    const plugin = createFastifyPlugin({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });

    const route = plugin.routes.find((item) => item.operationId === "health");
    expect(route?.method).toBe("GET");
    const result = await route!.handler({ headers: {} });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });

    const fallback = await route!.handler({});
    expect(fallback.status).toBe(200);
  });
});
