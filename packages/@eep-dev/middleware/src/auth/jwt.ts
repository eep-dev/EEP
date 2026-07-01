import { createHmac, timingSafeEqual } from "crypto";
import type { GateProof } from "@eep-dev/gates";
import type { AuthAdapter, IncomingRequest } from "../core/request-handler.js";

/** HS* algorithms this adapter can verify natively, mapped to their Node hash name. */
const HMAC_ALGORITHMS: Record<string, string> = {
  HS256: "sha256",
  HS384: "sha384",
  HS512: "sha512"
};

export type HmacAlgorithm = keyof typeof HMAC_ALGORITHMS;

/**
 * Verified-claims callback for asymmetric (RSA / ECDSA / EdDSA) or otherwise custom tokens.
 * It receives the raw compact JWT and MUST return the verified claim set, or `null`/`undefined`
 * if the signature (or any claim the implementer checks) does not verify. The middleware never
 * trusts a token the callback does not vouch for.
 */
export type JWTVerifyTokenFn = (
  token: string
) => Promise<Record<string, unknown> | null | undefined> | Record<string, unknown> | null | undefined;

export type JWTAuthAdapterOptions = {
  didClaim?: string;
  capabilityClaim?: string;
  /** Shared secret for HS256/HS384/HS512 verification. */
  secret?: string | Buffer;
  /** Delegated verifier for non-HMAC algorithms (e.g. wrapping `jose`/`jsonwebtoken`). */
  verifyToken?: JWTVerifyTokenFn;
  /** Explicit `alg` allowlist. `none` is always rejected regardless of this value. */
  algorithms?: string[];
  /** Clock skew tolerance (seconds) applied to `exp`/`nbf`/`iat`. Default 60. */
  clockToleranceSec?: number;
};

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const fixed = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(fixed, "base64").toString("utf8");
}

/** Constant-time comparison that tolerates differing lengths without throwing. */
function timingSafeEqualString(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export class JWTAuthAdapter implements AuthAdapter {
  private readonly didClaim: string;
  private readonly capabilityClaim: string;
  private readonly secret?: Buffer;
  private readonly verifyToken?: JWTVerifyTokenFn;
  private readonly algorithms?: string[];
  private readonly clockToleranceSec: number;

  constructor(options: JWTAuthAdapterOptions = {}) {
    this.didClaim = options.didClaim ?? "sub";
    this.capabilityClaim = options.capabilityClaim ?? "scope";
    this.secret =
      options.secret === undefined
        ? undefined
        : Buffer.isBuffer(options.secret)
          ? options.secret
          : Buffer.from(options.secret, "utf8");
    this.verifyToken = options.verifyToken;
    this.algorithms = options.algorithms;
    this.clockToleranceSec = options.clockToleranceSec ?? 60;

    if (!this.secret && !this.verifyToken) {
      // Fail closed: an adapter with no way to verify signatures must not mint
      // `did_verified` proofs from attacker-controlled tokens. It will emit nothing.
      console.warn(
        "[eep] JWTAuthAdapter constructed without `secret` or `verifyToken`; it will reject all tokens. " +
          "Configure an HS* secret or a verifyToken callback to enable authentication."
      );
    }
  }

  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return [];
    }

    const token = header.slice("Bearer ".length).trim();
    const parts = token.split(".");
    if (parts.length < 2) {
      return [];
    }

    let jwtHeader: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      jwtHeader = JSON.parse(decodeBase64Url(parts[0])) as Record<string, unknown>;
      payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    } catch {
      return [];
    }

    const alg = typeof jwtHeader.alg === "string" ? jwtHeader.alg : "";
    // `alg: none` (in any casing) is never acceptable for a token we are asked to trust.
    if (!alg || alg.toLowerCase() === "none") {
      return [];
    }
    if (this.algorithms && !this.algorithms.includes(alg)) {
      return [];
    }

    const claims = await this.verifyClaims(alg, parts, token, payload);
    if (!claims) {
      return [];
    }
    if (!this.passesTemporalChecks(claims)) {
      return [];
    }

    return this.claimsToProofs(claims);
  }

  private async verifyClaims(
    alg: string,
    parts: string[],
    token: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    if (alg in HMAC_ALGORITHMS) {
      if (!this.secret || parts.length !== 3) {
        return null;
      }
      const signingInput = `${parts[0]}.${parts[1]}`;
      const expected = createHmac(HMAC_ALGORITHMS[alg], this.secret).update(signingInput).digest();
      const provided = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
      return timingSafeEqualString(expected, provided) ? payload : null;
    }

    // Asymmetric / custom algorithm: delegate to the configured verifier (fail closed if none).
    if (!this.verifyToken) {
      return null;
    }
    try {
      const verified = await this.verifyToken(token);
      return verified ?? null;
    } catch {
      return null;
    }
  }

  private passesTemporalChecks(claims: Record<string, unknown>): boolean {
    const now = Math.floor(Date.now() / 1000);
    const tolerance = this.clockToleranceSec;

    if (typeof claims.exp === "number" && now > claims.exp + tolerance) {
      return false;
    }
    if (typeof claims.nbf === "number" && now < claims.nbf - tolerance) {
      return false;
    }
    if (typeof claims.iat === "number" && claims.iat > now + tolerance) {
      return false;
    }
    return true;
  }

  private claimsToProofs(claims: Record<string, unknown>): GateProof[] {
    const proofs: GateProof[] = [];

    const didValue = claims[this.didClaim];
    if (typeof didValue === "string" && didValue.length > 0) {
      proofs.push({ type: "identity", method: "did_verified", evidence: didValue });
    }

    const scopes = claims[this.capabilityClaim];
    if (typeof scopes === "string" && scopes.trim().length > 0) {
      proofs.push({
        type: "capability",
        declared_capabilities: scopes.split(" ").filter(Boolean)
      });
    }

    return proofs;
  }
}
