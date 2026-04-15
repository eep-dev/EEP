import type { GateProof } from "@eep-dev/gates";
import type { AuthAdapter, IncomingRequest } from "../core/request-handler.js";

export class OAuthAuthAdapter implements AuthAdapter {
  async extractProofs(request: IncomingRequest): Promise<GateProof[]> {
    const scope = request.headers["x-oauth-scope"] ?? request.query?.scope;
    if (!scope) {
      return [];
    }
    const scopes = scope.split(" ").map((item) => item.trim()).filter(Boolean);
    if (scopes.length === 0) {
      return [];
    }
    return [{ type: "capability", declared_capabilities: scopes }];
  }
}
