import { describe, expect, it } from "vitest";
import { JWTAuthAdapter } from "./jwt.js";

function encode(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("JWTAuthAdapter", () => {
  it("extracts identity and capabilities from bearer token", async () => {
    const token = encode({ sub: "did:web:alice.example", scope: "profile.read profile.write" });
    const adapter = new JWTAuthAdapter();
    const proofs = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(proofs.length).toBe(2);
  });

  it("returns empty proofs for invalid tokens", async () => {
    const adapter = new JWTAuthAdapter({ didClaim: "did", capabilityClaim: "caps" });
    const missingHeader = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: {}
    });
    expect(missingHeader).toEqual([]);

    const malformed = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: "Bearer bad-token" }
    });
    expect(malformed).toEqual([]);

    const parseFailure = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: "Bearer a.b@d.c" }
    });
    expect(parseFailure).toEqual([]);

    const noClaimsToken = encode({});
    const noClaims = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: `Bearer ${noClaimsToken}` }
    });
    expect(noClaims).toEqual([]);

    const noPaddingSegment = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: "Bearer hdr.eyJhIjoiYiJ9.sig" }
    });
    expect(noPaddingSegment).toEqual([]);
  });
});
