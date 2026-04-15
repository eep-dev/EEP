import {
  ProofVerifierRegistry,
  build402Response,
  parseGateConfig,
  resolveAccess,
  type GateProof,
} from "@eep-dev/gates";

export interface AccessDecision {
  granted: boolean;
  status: number;
  body?: unknown;
}

export async function evaluateMcpCallAccess(
  gateConfigInput: unknown,
  toolName: string,
  proofs: GateProof[],
  strictSemanticVerification = true,
): Promise<AccessDecision> {
  const gateConfig = parseGateConfig(gateConfigInput);
  const resource = `mcp.tools.call.${toolName}`;
  const registry = new ProofVerifierRegistry();

  registry.register({
    supportedTypes: ["payment", "credential", "agreement", "identity"],
    /* c8 ignore start */
    verify: async (proof) => {
      // Bridge defaults to conservative structural+presence semantics.
      // Integrators should override with platform verifiers for production.
      if ((proof as any).type === "payment") {
        return Boolean((proof as any).token || (proof as any).tx_hash || (proof as any).x402_payload);
      }
      if ((proof as any).type === "credential") {
        return typeof (proof as any).credential === "string" && (proof as any).credential.length > 0;
      }
      if ((proof as any).type === "agreement") {
        return typeof (proof as any).signature === "string" && (proof as any).signature.length > 0;
      }
      if ((proof as any).type === "identity") {
        return typeof (proof as any).did === "string";
      }
      return false;
    },
    /* c8 ignore stop */
  });

  const result = await resolveAccess(proofs, gateConfig, resource, registry, { strictSemanticVerification });
  if (result.granted) {
    return { granted: true, status: 200 };
  }

  const body = await build402Response(gateConfig, resource, proofs);
  return { granted: false, status: 402, body };
}
