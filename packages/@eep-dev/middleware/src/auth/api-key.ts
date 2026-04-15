import type { GateProof } from "@eep-dev/gates";
import type { AuthAdapter, IncomingRequest } from "../core/request-handler.js";

export type APIKeyResolver = (apiKey: string) => Promise<{ did?: string; capabilities?: string[] } | null>;

export class APIKeyAuthAdapter implements AuthAdapter {
  constructor(private readonly resolver: APIKeyResolver) {}

  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    const apiKey = request.headers["x-api-key"];
    if (!apiKey) {
      return [];
    }

    const resolved = await this.resolver(apiKey);
    if (!resolved) {
      return [];
    }

    const proofs: GateProof[] = [];
    if (resolved.did) {
      proofs.push({ type: "identity", method: "did_verified", evidence: resolved.did });
    }
    if (resolved.capabilities && resolved.capabilities.length > 0) {
      proofs.push({ type: "capability", declared_capabilities: resolved.capabilities });
    }
    return proofs;
  }
}
