import type { Requirement, ServiceListing } from "@eep-dev/gates";
import type { BridgeConfig, MCPIntrospection, MTool } from "./types.js";

function requirementFromTool(tool: MTool, cfg?: BridgeConfig["gatedTools"]): Requirement | null {
  const override = cfg?.[tool.name];
  if (override) {
    if (override.type === "public") return null;
    if (override.type === "payment") {
      return {
        type: "payment",
        amount: override.amount ?? 1,
        currency: (override.currency ?? "usd").toLowerCase(),
        per: "request",
      };
    }
    if (override.type === "agreement") {
      return {
        type: "agreement",
        document_hash: "sha256:bridge-required",
        document_url: "https://eep.dev/agreements/mcp-tool-usage",
        document_title: "MCP Tool Agreement",
        signature_algo: "EdDSA",
      };
    }
    if (override.type === "credential") {
      return {
        type: "credential",
        credential_type: override.credential_type ?? "BridgeCredential",
      };
    }
  }

  const ann = tool.annotations ?? {};
  if (ann.readOnlyHint === true) return null;
  if (ann.destructiveHint === true) {
    return {
      type: "agreement",
      document_hash: "sha256:destructive-tool",
      document_url: "https://eep.dev/agreements/destructive-tools",
      document_title: "Destructive Tool Acknowledgement",
      signature_algo: "EdDSA",
    };
  }
  if (typeof ann.price_usd === "number") {
    return { type: "payment", amount: ann.price_usd, currency: "usd", per: "request" };
  }
  if (typeof ann.required_credential === "string") {
    return { type: "credential", credential_type: ann.required_credential };
  }
  return null;
}

export function toEEPManifest(cfg: BridgeConfig, data: MCPIntrospection): Record<string, unknown> {
  return {
    did: cfg.did,
    eep_version: "0.1",
    layers: {
      layer1: `${cfg.baseUrl}/.well-known/eep.json`,
      layer2_sse: `${cfg.baseUrl}/eep/stream`,
      layer2_webhook: `${cfg.baseUrl}/eep/subscribe`,
      layer3_ws: `${cfg.baseUrl.replace(/^http/, "ws")}/eep/pulse`,
    },
    supported_content_types: Array.from(
      new Set(["application/json", ...data.resources.map((r) => r.mimeType).filter(Boolean)]),
    ),
    services_url: `${cfg.baseUrl}/eep/services`,
    pqc_ready: false,
    x402_enabled: true,
    bridge: {
      mcp_server_name: data.server.name,
      mcp_server_version: data.server.version ?? "unknown",
      tools_count: data.tools.length,
      resources_count: data.resources.length,
    },
    updated_at: new Date().toISOString(),
  };
}

export function toServiceCatalog(data: MCPIntrospection): { services: ServiceListing[] } {
  const services: ServiceListing[] = data.tools.map((tool) => ({
    id: tool.name,
    name: typeof tool.annotations?.title === "string" ? tool.annotations.title : tool.name,
    description: tool.description ?? `MCP tool ${tool.name}`,
    category: "mcp",
    tags: ["bridge", "mcp"],
    pricing: {
      model: "fixed",
      amount: 0,
      currency: "usd",
    },
    availability: {
      type: "always",
    },
    delivery: "api",
    status: "active",
    metadata: {
      input_schema: tool.inputSchema ?? {},
      annotations: tool.annotations ?? {},
    },
  }));
  return { services };
}

export function toGateConfig(cfg: BridgeConfig, data: MCPIntrospection): Record<string, unknown> {
  const tiers: Record<string, any> = {
    public: { access: ["eep.services.list"], requirements: [] },
  };

  for (const tool of data.tools) {
    const req = requirementFromTool(tool, cfg.gatedTools);
    const tierName = `tool_${tool.name}`;
    tiers[tierName] = {
      access: [`mcp.tools.call.${tool.name}`],
      requirements: req ? [req] : [],
    };
  }

  return {
    version: "0.1",
    default_tier: "public",
    tiers,
  };
}
