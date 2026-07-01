import type { GateProof } from "@eep-dev/gates";
import type { AuthAdapter, IncomingRequest } from "../core/request-handler.js";

/**
 * The subset of an RFC 7662 token-introspection response this adapter relies on.
 * `active` is the authoritative signal; `scope`/`sub` are read only when `active === true`.
 */
export type OAuthIntrospectionResult = {
  active: boolean;
  /** Space-delimited granted scopes, as returned by the authorization server. */
  scope?: string;
  /** The subject (agent DID) the authorization server bound the token to. */
  sub?: string;
};

export type OAuthIntrospectFn = (
  token: string
) => Promise<OAuthIntrospectionResult | null | undefined> | OAuthIntrospectionResult | null | undefined;

export type OAuthAuthAdapterOptions = {
  /**
   * RFC 7662-style token introspection. Receives the bearer access token and MUST return the
   * authorization server's decision. Scopes are taken from the response, never from a
   * client-supplied header.
   */
  introspect: OAuthIntrospectFn;
};

export class OAuthAuthAdapter implements AuthAdapter {
  private readonly introspect?: OAuthIntrospectFn;

  constructor(options?: OAuthAuthAdapterOptions) {
    this.introspect = options?.introspect;
    if (typeof this.introspect !== "function") {
      // Fail closed: without introspection we cannot tell a forged scope from a granted one.
      console.warn(
        "[eep] OAuthAuthAdapter constructed without an `introspect` callback; it will reject all tokens. " +
          "Provide an RFC 7662 token-introspection function to enable authentication."
      );
    }
  }

  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    if (typeof this.introspect !== "function") {
      return [];
    }

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return [];
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return [];
    }

    let result: OAuthIntrospectionResult | null | undefined;
    try {
      result = await this.introspect(token);
    } catch {
      return [];
    }
    if (!result || result.active !== true) {
      return [];
    }

    const proofs: GateProof[] = [];

    if (typeof result.sub === "string" && result.sub.length > 0) {
      proofs.push({ type: "identity", method: "did_verified", evidence: result.sub });
    }

    if (typeof result.scope === "string" && result.scope.trim().length > 0) {
      const scopes = result.scope.split(" ").map((item) => item.trim()).filter(Boolean);
      if (scopes.length > 0) {
        proofs.push({ type: "capability", declared_capabilities: scopes });
      }
    }

    return proofs;
  }
}
