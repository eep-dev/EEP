import { describe, expect, it } from "vitest";
import { generateArtifacts } from "./artifacts.js";
import { getPresetConfig } from "../prompts/presets.js";

describe("artifact generation", () => {
  it("generates full artifact set with expected keys", () => {
    const config = getPresetConfig("exchange");
    const artifacts = generateArtifacts(config);
    const keys = Object.keys(artifacts).sort();
    expect(keys).toContain(".well-known/eep.json");
    expect(keys).toContain("gate-config.json");
    expect(keys).toContain("service-catalog.json");
    expect(keys).toContain("event-types.json");
    expect(keys).toContain("security-config.json");
    expect(keys).toContain("infra/compose.yml");
    expect(keys).toContain("runtime/server.ts");
    expect(keys).toContain("discovery/dns-instructions.txt");
    expect(keys).toContain("compliance-declarations.json");
    expect(keys).toContain("commerce-config.json");
    expect(keys).toContain("operator-policies.json");
    expect(keys).toContain("bridge.config.json");
    expect(keys).toContain("openapi-eep.json");
    expect(keys).toContain("eep-contract-tests/basic.hurl");
    expect(keys).toContain("adapter-config.json");
  });

  it("toggles optional openapi paths by config capability", () => {
    const config = getPresetConfig("iot-publisher");
    const artifacts = generateArtifacts(config);
    const openapi = JSON.parse(artifacts["openapi-eep.json"]) as { openapi: string; info: Record<string, unknown>; tags: unknown[]; paths: Record<string, unknown> };
    expect(openapi.paths["/eep/gates"]).toBeUndefined();
    expect(openapi.paths["/eep/services"]).toBeUndefined();
    expect(openapi.paths["/eep/stream"]).toBeDefined();
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.info.license).toBeDefined();
    expect(openapi.tags).toBeDefined();
  });

  it("openapi includes Layer 1 details with schema refs and headers", () => {
    const config = getPresetConfig("exchange");
    const artifacts = generateArtifacts(config);
    const openapi = JSON.parse(artifacts["openapi-eep.json"]) as { paths: Record<string, any>; servers: unknown[] };
    const entity = openapi.paths["/u/{entityType}/{entityId}"];
    expect(entity).toBeDefined();
    expect(entity.get.parameters.length).toBeGreaterThanOrEqual(2);
    expect(entity.get.responses["200"].headers).toBeDefined();
    expect(entity.get.responses["402"]).toBeDefined();
    expect(entity.get.responses["403"]).toBeDefined();
    expect(openapi.servers).toBeDefined();
    const manifest = openapi.paths["/.well-known/eep.json"];
    expect(manifest.get.tags).toContain("Layer 1");
  });

  it("handles empty versions and missing dns hint fallbacks", () => {
    const config = getPresetConfig("saas");
    config.identity.eep_versions = [];
    config.delivery.methods = ["webhook"];
    config.discovery.dns_txt = undefined;
    config.gates.x402 = undefined;
    const artifacts = generateArtifacts(config);
    const manifest = JSON.parse(artifacts[".well-known/eep.json"]) as { eep_version: string; layers: Record<string, string | undefined> };
    expect(manifest.eep_version).toBe("0.1");
    expect(manifest.layers.layer2_sse).toBeUndefined();
    expect(manifest.layers.layer2_webhook).toBeDefined();
    expect(artifacts["discovery/dns-instructions.txt"]).toBe("v=eep1\n");
  });

  it("emits x402_enabled true when x402 config is enabled", () => {
    const config = getPresetConfig("exchange");
    config.gates.x402 = {
      enabled: true,
      facilitator_url: "https://x402.example",
      payment_rails: ["x402/usdc"],
      network: "base"
    };
    const artifacts = generateArtifacts(config);
    const manifest = JSON.parse(artifacts[".well-known/eep.json"]) as { x402_enabled: boolean };
    expect(manifest.x402_enabled).toBe(true);
  });

  it("handles large service/event catalogs without dropping artifacts", () => {
    const config = getPresetConfig("marketplace");
    config.services.catalog = Array.from({ length: 500 }, (_, index) => ({
      id: `svc_${index}`,
      name: `Service ${index}`
    }));
    config.delivery.events = Array.from({ length: 500 }, (_, index) => `event.${index}`);

    const artifacts = generateArtifacts(config);
    const services = JSON.parse(artifacts["service-catalog.json"]) as { services: unknown[] };
    const events = JSON.parse(artifacts["event-types.json"]) as { events: string[] };
    expect(services.services.length).toBe(500);
    expect(events.events.length).toBe(500);
  });
});
