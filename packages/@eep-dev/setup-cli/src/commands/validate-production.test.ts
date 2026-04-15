import { describe, expect, it } from "vitest";
import type { EEPSetupConfig } from "../types/config.js";
import { validateProductionIdentity } from "./validate-production.js";

function baseConfig(overrides: Partial<EEPSetupConfig["identity"]> = {}): EEPSetupConfig {
  return {
    setup_schema_version: "0.1",
    mode: "init",
    identity: {
      org_name: "Acme",
      domain: "api.acme.com",
      did: "did:web:api.acme.com",
      base_url: "https://api.acme.com",
      eep_versions: ["0.1"],
      content_types: ["application/json"],
      ...overrides
    },
    conformance: { target_tier: "Core", environment: "production", runtime: "node" },
    entities: { types: ["u"], samples: [{ type: "u", id: "default" }] },
    discovery: {
      well_known: true,
      link_header: true,
      agent_card: { enabled: true, anp_compatible: true }
    },
    delivery: { methods: ["sse"], events: ["entity.updated"] },
    gates: { enabled: true, default_tier: "public", fallback: "restrict", tiers: {} },
    services: { enabled: true, pricing_mode: "fixed", catalog: [] },
    security: {
      signing_algorithms: ["EdDSA"],
      pqc_ready: false,
      tls_mode: "standard",
      forward_secrecy: true,
      strict_fail_closed: true
    },
    pulse: { enabled: false, chat: false, commerce_state_machine: false, session_tokens: false, audit_log: false },
    compliance: {
      eu_ai_act: false,
      gdpr: true,
      dora: false,
      data_residency: "Worldwide",
      dpv_purpose: "https://w3id.org/dpv#ServiceProvision"
    },
    infra: {
      postgres: "postgresql://localhost/eep",
      redis: "redis://localhost:6379",
      ports: { node: 3100, python: 3200 },
      compose: false
    },
    bridge: { enabled: false },
    adapters: {
      auth: { type: "jwt_claims", did_claim: "sub", tier_claim: "tier" },
      database: { type: "postgres", shared: true },
      event_bus: { type: "redis", shared: true },
      framework: { type: "express", mount_path: "/" }
    }
  } as EEPSetupConfig;
}

describe("validateProductionIdentity", () => {
  it("passes for non-placeholder identity", () => {
    expect(validateProductionIdentity(baseConfig())).toEqual([]);
  });

  it("flags example.com domain", () => {
    const issues = validateProductionIdentity(
      baseConfig({ domain: "api.example.com", base_url: "https://api.example.com", did: "did:web:api.example.com" })
    );
    expect(issues.some((i) => i.includes("domain"))).toBe(true);
  });

  it("flags placeholder did", () => {
    const issues = validateProductionIdentity(baseConfig({ did: "did:web:example.com" }));
    expect(issues.some((i) => i.includes("did"))).toBe(true);
  });
});
