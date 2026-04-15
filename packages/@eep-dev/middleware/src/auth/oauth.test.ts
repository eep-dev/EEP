import { describe, expect, it } from "vitest";
import { OAuthAuthAdapter } from "./oauth.js";

describe("OAuthAuthAdapter", () => {
  it("extracts capability proofs from header and query", async () => {
    const adapter = new OAuthAuthAdapter();
    const fromHeader = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-oauth-scope": "a b" }
    });
    expect(fromHeader.length).toBe(1);

    const fromQuery = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: {},
      query: { scope: "x y" }
    });
    expect(fromQuery.length).toBe(1);

    const none = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: {}
    });
    expect(none).toEqual([]);

    const empty = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-oauth-scope": "   " }
    });
    expect(empty).toEqual([]);
  });
});
