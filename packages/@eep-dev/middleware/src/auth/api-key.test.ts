import { describe, expect, it } from "vitest";
import { APIKeyAuthAdapter } from "./api-key.js";

describe("APIKeyAuthAdapter", () => {
  it("extracts proofs using resolver response", async () => {
    const adapter = new APIKeyAuthAdapter(async (key) => {
      if (key === "valid") {
        return { did: "did:web:agent.example", capabilities: ["trade.read"] };
      }
      if (key === "partial") {
        return {};
      }
      return null;
    });

    const proofs = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-api-key": "valid" }
    });
    expect(proofs.length).toBe(2);

    const missing = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: {}
    });
    expect(missing).toEqual([]);

    const partial = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-api-key": "partial" }
    });
    expect(partial).toEqual([]);

    const unknown = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-api-key": "unknown" }
    });
    expect(unknown).toEqual([]);
  });
});
