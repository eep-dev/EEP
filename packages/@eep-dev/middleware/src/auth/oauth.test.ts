import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthAuthAdapter } from "./oauth.js";

function bearer(token: string) {
  return { method: "GET" as const, path: "/", headers: { authorization: `Bearer ${token}` } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuthAuthAdapter — fail-closed introspection", () => {
  it("warns once and emits no proofs when no introspect callback is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // @ts-expect-error — intentionally constructing without the required introspect callback.
    const adapter = new OAuthAuthAdapter();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/OAuthAuthAdapter/);

    // A raw scope header must NOT be trusted any more.
    const proofs = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { "x-oauth-scope": "admin.all" }
    });
    expect(proofs).toEqual([]);
  });

  it("emits capability + identity proofs from an active introspection result", async () => {
    const introspect = vi.fn(async (token: string) => {
      expect(token).toBe("opaque-access-token");
      return { active: true, scope: "profile.read profile.write", sub: "did:web:alice.example" };
    });
    const adapter = new OAuthAuthAdapter({ introspect });
    const proofs = await adapter.extractProofs(bearer("opaque-access-token"));
    expect(proofs).toEqual([
      { type: "identity", method: "did_verified", evidence: "did:web:alice.example" },
      { type: "capability", declared_capabilities: ["profile.read", "profile.write"] }
    ]);
  });

  it("ignores a client-supplied x-oauth-scope header (only the AS response is trusted)", async () => {
    const introspect = vi.fn(async () => ({ active: true, scope: "profile.read" }));
    const adapter = new OAuthAuthAdapter({ introspect });
    const proofs = await adapter.extractProofs({
      method: "GET",
      path: "/",
      headers: { authorization: "Bearer t", "x-oauth-scope": "admin.all" }
    });
    expect(proofs).toEqual([{ type: "capability", declared_capabilities: ["profile.read"] }]);
  });

  it("emits no proofs when introspection reports the token inactive", async () => {
    const introspect = vi.fn(async () => ({ active: false, scope: "admin.all" }));
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs(bearer("revoked"))).toEqual([]);
  });

  it("emits no proofs when introspection returns null", async () => {
    const introspect = vi.fn(async () => null);
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs(bearer("unknown"))).toEqual([]);
  });

  it("emits no proofs when there is no bearer token to introspect", async () => {
    const introspect = vi.fn(async () => ({ active: true, scope: "x" }));
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs({ method: "GET", path: "/", headers: {} })).toEqual([]);
    expect(
      await adapter.extractProofs({ method: "GET", path: "/", headers: { authorization: "Basic abc" } })
    ).toEqual([]);
    expect(
      await adapter.extractProofs({ method: "GET", path: "/", headers: { authorization: "Bearer " } })
    ).toEqual([]);
    expect(introspect).not.toHaveBeenCalled();
  });

  it("handles an active result with empty / whitespace scope and no sub", async () => {
    const introspect = vi.fn(async () => ({ active: true, scope: "   " }));
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs(bearer("t"))).toEqual([]);
  });

  it("emits only the identity proof when scope is absent", async () => {
    const introspect = vi.fn(async () => ({ active: true, sub: "did:web:only-id" }));
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs(bearer("t"))).toEqual([
      { type: "identity", method: "did_verified", evidence: "did:web:only-id" }
    ]);
  });

  it("fails closed when the introspection callback throws", async () => {
    const introspect = vi.fn(async () => {
      throw new Error("introspection endpoint down");
    });
    const adapter = new OAuthAuthAdapter({ introspect });
    expect(await adapter.extractProofs(bearer("t"))).toEqual([]);
  });
});
