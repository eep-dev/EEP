import type { GateProof } from "@eep-dev/gates";
import type { AuthAdapter, IncomingRequest } from "../core/request-handler.js";

export type JWTAuthAdapterOptions = {
  didClaim?: string;
  capabilityClaim?: string;
};

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const fixed = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return Buffer.from(fixed, "base64").toString("utf8");
}

export class JWTAuthAdapter implements AuthAdapter {
  private readonly didClaim: string;
  private readonly capabilityClaim: string;

  constructor(options: JWTAuthAdapterOptions = {}) {
    this.didClaim = options.didClaim ?? "sub";
    this.capabilityClaim = options.capabilityClaim ?? "scope";
  }

  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return [];
    }

    const token = header.slice("Bearer ".length);
    const parts = token.split(".");
    if (parts.length < 2) {
      return [];
    }

    try {
      const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
      const proofs: GateProof[] = [];
      const didValue = payload[this.didClaim];
      if (typeof didValue === "string" && didValue.length > 0) {
        proofs.push({ type: "identity", method: "did_verified", evidence: didValue });
      }

      const scopes = payload[this.capabilityClaim];
      if (typeof scopes === "string" && scopes.trim().length > 0) {
        proofs.push({
          type: "capability",
          declared_capabilities: scopes.split(" ").filter(Boolean)
        });
      }
      return proofs;
    } catch {
      return [];
    }
  }
}
