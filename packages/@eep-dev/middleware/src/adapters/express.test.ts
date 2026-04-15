import { describe, expect, it } from "vitest";
import { createEEPRouter } from "./express.js";

describe("createEEPRouter", () => {
  it("builds route bindings and executes handlers", async () => {
    const router = createEEPRouter({
      baseUrl: "https://api.example.com",
      did: "did:web:example.com"
    });

    expect(router.routes.length).toBeGreaterThan(0);
    const manifestRoute = router.routes.find((route) => route.operationId === "manifest");
    expect(manifestRoute?.method).toBe("get");

    const response = await manifestRoute!.execute({
      method: "GET",
      path: "/.well-known/eep.json",
      headers: {}
    });
    expect(response.status).toBe(200);

    const fallbackResponse = await manifestRoute!.execute({});
    expect(fallbackResponse.status).toBe(200);
  });
});
