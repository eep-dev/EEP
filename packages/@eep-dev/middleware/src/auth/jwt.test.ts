import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JWTAuthAdapter } from "./jwt.js";

const SECRET = "test-shared-secret-at-least-32-bytes-long!";

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

const HMAC_HASH: Record<string, string> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512"
};

/** Produce a real HS* JWT signed with `secret`. */
function signHS(
  payload: Record<string, unknown>,
  secret: string = SECRET,
  alg: "HS256" | "HS384" | "HS512" = "HS256",
  extraHeader: Record<string, unknown> = {}
): string {
  const header = b64url(JSON.stringify({ alg, typ: "JWT", ...extraHeader }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac(HMAC_HASH[alg], secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Produce a token with an arbitrary `alg` header and a dummy signature. */
function tokenWithAlg(payload: Record<string, unknown>, alg: string): string {
  const header = b64url(JSON.stringify({ alg, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.ZHVtbXk`;
}

function bearer(token: string) {
  return { method: "GET" as const, path: "/", headers: { authorization: `Bearer ${token}` } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JWTAuthAdapter — fail-closed verification", () => {
  it("warns once and emits no proofs when neither secret nor verifyToken is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new JWTAuthAdapter();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/JWTAuthAdapter/);

    // Even a structurally valid (but unverifiable) token grants nothing.
    const token = signHS({ sub: "did:web:alice.example", scope: "profile.read profile.write" });
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("extracts identity + capability proofs from a token correctly signed with the configured secret", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const token = signHS({ sub: "did:web:alice.example", scope: "profile.read profile.write" });
    const proofs = await adapter.extractProofs(bearer(token));
    expect(proofs).toEqual([
      { type: "identity", method: "did_verified", evidence: "did:web:alice.example" },
      { type: "capability", declared_capabilities: ["profile.read", "profile.write"] }
    ]);
  });

  it("verifies HS384 and HS512 tokens when alg is in the allowlist", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const t384 = signHS({ sub: "did:web:a" }, SECRET, "HS384");
    const t512 = signHS({ sub: "did:web:b" }, SECRET, "HS512");
    expect(await adapter.extractProofs(bearer(t384))).toHaveLength(1);
    expect(await adapter.extractProofs(bearer(t512))).toHaveLength(1);
  });

  it("rejects a token whose header carries no string alg", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const header = b64url(JSON.stringify({ typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "did:web:a" }));
    expect(await adapter.extractProofs(bearer(`${header}.${body}.sig`))).toEqual([]);
  });

  it("rejects an alg:none token even when a secret is configured", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const token = `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(
      JSON.stringify({ sub: "did:web:attacker", scope: "admin.all" })
    )}.`;
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const token = signHS({ sub: "did:web:alice.example" }, "the-wrong-secret-the-wrong-secret-xx");
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("rejects an HS token whose signature is the wrong length", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "did:web:a" }));
    // 3-byte signature can never equal a 32-byte HMAC-SHA256 digest.
    const token = `${header}.${body}.AAAA`;
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("accepts a Buffer secret", async () => {
    const adapter = new JWTAuthAdapter({ secret: Buffer.from(SECRET, "utf8") });
    const token = signHS({ sub: "did:web:buffer-secret" });
    expect(await adapter.extractProofs(bearer(token))).toHaveLength(1);
  });

  it("rejects a token whose payload was tampered after signing", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const original = signHS({ sub: "did:web:alice.example", scope: "profile.read" });
    const [header, , sig] = original.split(".");
    const forgedBody = b64url(JSON.stringify({ sub: "did:web:attacker", scope: "admin.all" }));
    const tampered = `${header}.${forgedBody}.${sig}`;
    expect(await adapter.extractProofs(bearer(tampered))).toEqual([]);
  });

  it("rejects an HS-allowlisted secret being used against an asymmetric alg (algorithm confusion)", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    // RS256 header, but no verifyToken configured → must not fall through to HMAC.
    const token = tokenWithAlg({ sub: "did:web:attacker", scope: "admin.all" }, "RS256");
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("honours an explicit algorithms allowlist", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET, algorithms: ["HS256"] });
    const ok = signHS({ sub: "did:web:a" }, SECRET, "HS256");
    const blocked = signHS({ sub: "did:web:b" }, SECRET, "HS512");
    expect(await adapter.extractProofs(bearer(ok))).toHaveLength(1);
    expect(await adapter.extractProofs(bearer(blocked))).toEqual([]);
  });

  it("rejects expired and not-yet-valid tokens", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const now = Math.floor(Date.now() / 1000);
    const expired = signHS({ sub: "did:web:a", exp: now - 3600 });
    const notYet = signHS({ sub: "did:web:a", nbf: now + 3600 });
    const future = signHS({ sub: "did:web:a", iat: now + 3600 });
    expect(await adapter.extractProofs(bearer(expired))).toEqual([]);
    expect(await adapter.extractProofs(bearer(notYet))).toEqual([]);
    expect(await adapter.extractProofs(bearer(future))).toEqual([]);
  });

  it("accepts tokens within the configured clock tolerance", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET, clockToleranceSec: 120 });
    const now = Math.floor(Date.now() / 1000);
    const justExpired = signHS({ sub: "did:web:a", exp: now - 30 });
    expect(await adapter.extractProofs(bearer(justExpired))).toHaveLength(1);
  });

  it("returns empty proofs for missing / non-bearer / malformed tokens", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    expect(await adapter.extractProofs({ method: "GET", path: "/", headers: {} })).toEqual([]);
    expect(
      await adapter.extractProofs({ method: "GET", path: "/", headers: { authorization: "Basic abc" } })
    ).toEqual([]);
    expect(await adapter.extractProofs(bearer("only-one-part"))).toEqual([]);
    expect(await adapter.extractProofs(bearer("two.parts"))).toEqual([]);
    expect(await adapter.extractProofs(bearer("bad.@.sig"))).toEqual([]);
  });

  it("emits only the claims that are present", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET });
    const didOnly = signHS({ sub: "did:web:a" });
    const scopeOnly = signHS({ scope: "a b" });
    const neither = signHS({ unrelated: true });
    expect(await adapter.extractProofs(bearer(didOnly))).toHaveLength(1);
    expect(await adapter.extractProofs(bearer(scopeOnly))).toHaveLength(1);
    expect(await adapter.extractProofs(bearer(neither))).toEqual([]);
  });

  it("supports custom didClaim and capabilityClaim", async () => {
    const adapter = new JWTAuthAdapter({ secret: SECRET, didClaim: "did", capabilityClaim: "caps" });
    const token = signHS({ did: "did:web:custom", caps: "x y" });
    const proofs = await adapter.extractProofs(bearer(token));
    expect(proofs).toEqual([
      { type: "identity", method: "did_verified", evidence: "did:web:custom" },
      { type: "capability", declared_capabilities: ["x", "y"] }
    ]);
  });
});

describe("JWTAuthAdapter — verifyToken delegation (asymmetric / custom)", () => {
  it("uses the verifyToken result to extract proofs and never falls back to HMAC", async () => {
    const verifyToken = vi.fn(async () => ({ sub: "did:web:rsa", scope: "read" }));
    const adapter = new JWTAuthAdapter({ verifyToken });
    const token = tokenWithAlg({ sub: "did:web:rsa", scope: "read" }, "RS256");
    const proofs = await adapter.extractProofs(bearer(token));
    expect(verifyToken).toHaveBeenCalledWith(token);
    expect(proofs).toEqual([
      { type: "identity", method: "did_verified", evidence: "did:web:rsa" },
      { type: "capability", declared_capabilities: ["read"] }
    ]);
  });

  it("emits no proofs when verifyToken rejects the token", async () => {
    const verifyToken = vi.fn(async () => null);
    const adapter = new JWTAuthAdapter({ verifyToken });
    const token = tokenWithAlg({ sub: "did:web:rsa" }, "ES256");
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
    expect(verifyToken).toHaveBeenCalledTimes(1);
  });

  it("rejects alg:none before consulting verifyToken", async () => {
    const verifyToken = vi.fn(async () => ({ sub: "did:web:attacker" }));
    const adapter = new JWTAuthAdapter({ verifyToken });
    const token = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify({ sub: "x" }))}.`;
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("prefers native HMAC for HS algs when both secret and verifyToken are configured", async () => {
    const verifyToken = vi.fn(async () => ({ sub: "did:web:should-not-be-used" }));
    const adapter = new JWTAuthAdapter({ secret: SECRET, verifyToken });
    const token = signHS({ sub: "did:web:hmac" });
    const proofs = await adapter.extractProofs(bearer(token));
    expect(verifyToken).not.toHaveBeenCalled();
    expect(proofs[0]).toMatchObject({ evidence: "did:web:hmac" });
  });

  it("enforces temporal claims on verifyToken results too", async () => {
    const now = Math.floor(Date.now() / 1000);
    const verifyToken = vi.fn(async () => ({ sub: "did:web:rsa", exp: now - 3600 }));
    const adapter = new JWTAuthAdapter({ verifyToken });
    const token = tokenWithAlg({ sub: "did:web:rsa", exp: now - 3600 }, "EdDSA");
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });

  it("fails closed when the verifyToken callback throws", async () => {
    const verifyToken = vi.fn(async () => {
      throw new Error("key resolution failed");
    });
    const adapter = new JWTAuthAdapter({ verifyToken });
    const token = tokenWithAlg({ sub: "did:web:rsa" }, "ES256");
    expect(await adapter.extractProofs(bearer(token))).toEqual([]);
  });
});
