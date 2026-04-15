import { describe, expect, it } from "vitest";
import { toEEPManifest, toGateConfig, toServiceCatalog } from "./mapping.js";
import type { BridgeConfig, MCPIntrospection } from "./types.js";

const cfg: BridgeConfig = {
  did: "did:web:bridge.eep.dev",
  baseUrl: "http://localhost:3001",
  mcpBaseUrl: "http://localhost:4100",
};

const data: MCPIntrospection = {
  server: { name: "test-mcp", version: "1.2.3" },
  tools: [
    { name: "read_file", annotations: { readOnlyHint: true } },
    { name: "delete_file", annotations: { destructiveHint: true } },
    { name: "premium_search", annotations: { price_usd: 5 } },
  ],
  resources: [{ uri: "res://a", mimeType: "text/plain" }],
};

describe("mapping", () => {
  it("builds EEP manifest from MCP introspection", () => {
    const manifest = toEEPManifest(cfg, data) as any;
    expect(manifest.did).toBe(cfg.did);
    expect(manifest.layers.layer2_sse).toContain("/eep/stream");
    expect(manifest.supported_content_types).toContain("text/plain");
  });

  it("builds service catalog", () => {
    const catalog = toServiceCatalog(data);
    expect(catalog.services).toHaveLength(3);
    expect(catalog.services[0].id).toBe("read_file");
  });

  it("builds gate config from annotations", () => {
    const gate = toGateConfig(cfg, data) as any;
    expect(gate.default_tier).toBe("public");
    expect(gate.tiers.tool_read_file.requirements).toHaveLength(0);
    expect(gate.tiers.tool_delete_file.requirements[0].type).toBe("agreement");
    expect(gate.tiers.tool_premium_search.requirements[0].type).toBe("payment");
  });

  it("prefers explicit tool config override", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          read_file: {
            type: "credential",
            credential_type: "ReaderRole",
          },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_read_file.requirements[0].type).toBe("credential");
    expect(gate.tiers.tool_read_file.requirements[0].credential_type).toBe("ReaderRole");
  });

  it("supports explicit agreement override", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          read_file: { type: "agreement" },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_read_file.requirements[0].type).toBe("agreement");
  });

  it("supports explicit payment override", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          read_file: { type: "payment", amount: 9, currency: "USD" },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_read_file.requirements[0].type).toBe("payment");
    expect(gate.tiers.tool_read_file.requirements[0].currency).toBe("usd");
  });

  it("defaults payment override fields", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          read_file: { type: "payment" },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_read_file.requirements[0].amount).toBe(1);
    expect(gate.tiers.tool_read_file.requirements[0].currency).toBe("usd");
  });

  it("supports explicit public override", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          premium_search: { type: "public" },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_premium_search.requirements).toHaveLength(0);
  });

  it("defaults credential override type", () => {
    const gate = toGateConfig(
      {
        ...cfg,
        gatedTools: {
          read_file: { type: "credential" },
        },
      },
      data,
    ) as any;
    expect(gate.tiers.tool_read_file.requirements[0].credential_type).toBe("BridgeCredential");
  });

  it("handles required_credential annotation", () => {
    const gate = toGateConfig(cfg, {
      ...data,
      tools: [{ name: "vc_tool", annotations: { required_credential: "CompanyCredential" } }],
    }) as any;
    expect(gate.tiers.tool_vc_tool.requirements[0].type).toBe("credential");
  });

  it("creates empty requirements for unannotated tool", () => {
    const gate = toGateConfig(cfg, {
      ...data,
      tools: [{ name: "plain_tool" }],
    }) as any;
    expect(gate.tiers.tool_plain_tool.requirements).toHaveLength(0);
  });

  it("defaults server version in manifest", () => {
    const manifest = toEEPManifest(cfg, {
      ...data,
      server: { name: "test-mcp" },
    } as any) as any;
    expect(manifest.bridge.mcp_server_version).toBe("unknown");
  });

  it("defaults service title/description/metadata fields", () => {
    const out = toServiceCatalog({
      ...data,
      tools: [{ name: "bare_tool" }],
    } as any);
    expect(out.services[0].name).toBe("bare_tool");
    expect(out.services[0].description).toContain("MCP tool");
    expect(out.services[0].metadata?.input_schema).toEqual({});
  });

  it("uses annotation title for service name when provided", () => {
    const out = toServiceCatalog({
      ...data,
      tools: [{ name: "t", annotations: { title: "Human Name" } }],
    } as any);
    expect(out.services[0].name).toBe("Human Name");
  });
});
