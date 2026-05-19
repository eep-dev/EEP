import { describe, expect, it } from "vitest";
import { createEEPApp } from "./hono.js";

describe("createEEPApp", () => {
  it("creates hono-like fetch handlers", async () => {
    const app = createEEPApp({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });

    const route = app.routes.find((item) => item.operationId === "subscribe");
    const response = await route!.fetch({
      req: {
        header: () => undefined,
        query: () => undefined,
        param: () => undefined,
        json: async () => ({ source_did: "did:web:agent.example", delivery_method: "sse", event_types: ["com.example.*"] })
      }
    });
    expect(response.status).toBe(201);

    const manifestRoute = app.routes.find((item) => item.operationId === "manifest");
    const manifest = await manifestRoute!.fetch({
      req: {
        header: (name) => (name === "x-eep-proofs" ? "[]" : undefined),
        query: () => undefined,
        param: () => undefined,
        json: async () => ({ ignored: true })
      }
    });
    expect(manifest.status).toBe(200);
  });
});
