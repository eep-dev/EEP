import type { EEPSetupConfig } from "../types/config.js";

type PresetName = "exchange" | "marketplace" | "saas" | "data-provider" | "iot-publisher";

const baseConfig: EEPSetupConfig = {
  setup_schema_version: "0.1",
  mode: "init",
  identity: {
    org_name: "ExampleOrg",
    domain: "example.com",
    did: "did:web:example.com",
    base_url: "https://api.example.com",
    eep_versions: ["0.1"],
    content_types: ["application/json"]
  },
  conformance: {
    target_tier: "Core",
    environment: "development",
    runtime: "node"
  },
  entities: {
    types: ["u"],
    samples: [{ type: "u", id: "default" }]
  },
  discovery: {
    well_known: true,
    link_header: true,
    dns_txt: "v=eep1; manifest=https://api.example.com/.well-known/eep.json",
    agent_card: { enabled: true, anp_compatible: true }
  },
  delivery: {
    methods: ["sse", "webhook"],
    events: ["entity.updated"]
  },
  gates: {
    enabled: true,
    default_tier: "public",
    fallback: "restrict",
    tiers: {
      public: { requirements: [], access: ["entity.public.profile"] }
    }
  },
  services: {
    enabled: true,
    pricing_mode: "fixed",
    catalog: []
  },
  security: {
    signing_algorithms: ["EdDSA"],
    pqc_ready: false,
    tls_mode: "standard",
    forward_secrecy: true,
    strict_fail_closed: true
  },
  pulse: {
    enabled: false,
    chat: false,
    commerce_state_machine: false,
    session_tokens: false,
    audit_log: false
  },
  compliance: {
    eu_ai_act: false,
    gdpr: true,
    dora: false,
    data_residency: "Worldwide",
    dpv_purpose: "https://w3id.org/dpv#ServiceProvision"
  },
  infra: {
    postgres: "postgresql://eep:eep@localhost:5432/eep",
    redis: "redis://localhost:6379",
    ports: { node: 3100, python: 3200 },
    compose: true
  },
  bridge: { enabled: false },
  adapters: {
    auth: { type: "jwt_claims", did_claim: "sub", tier_claim: "tier" },
    database: { type: "postgres", shared: true },
    event_bus: { type: "redis", shared: true },
    framework: { type: "express", mount_path: "/" }
  }
};

function cloneConfig(): EEPSetupConfig {
  return JSON.parse(JSON.stringify(baseConfig)) as EEPSetupConfig;
}

export function listPresets(): PresetName[] {
  return ["exchange", "marketplace", "saas", "data-provider", "iot-publisher"];
}

export function getPresetConfig(preset: PresetName): EEPSetupConfig {
  const config = cloneConfig();
  if (preset === "exchange") {
    config.identity.org_name = "Exchange";
    config.conformance.target_tier = "Full";
    config.gates.tiers.premium = {
      requirements: [{ type: "payment", amount: 10, currency: "usd", per: "request" }],
      access: ["*"]
    };
    config.pulse.enabled = true;
    config.pulse.commerce_state_machine = true;
    config.compliance.dora = true;
    return config;
  }
  if (preset === "marketplace") {
    config.identity.org_name = "Marketplace";
    config.conformance.target_tier = "Full";
    config.services.pricing_mode = "auction";
    config.pulse.enabled = true;
    config.gates.tiers.premium = {
      requirements: [{ type: "identity", method: "did_verified" }],
      access: ["service.*"]
    };
    return config;
  }
  if (preset === "saas") {
    config.identity.org_name = "SaaS";
    config.conformance.target_tier = "Standard";
    config.services.pricing_mode = "fixed";
    return config;
  }
  if (preset === "data-provider") {
    config.identity.org_name = "DataProvider";
    config.conformance.target_tier = "Standard";
    config.delivery.methods = ["sse"];
    config.services.pricing_mode = "negotiable";
    return config;
  }
  config.identity.org_name = "IoTPublisher";
  config.conformance.target_tier = "Core";
  config.delivery.methods = ["sse"];
  config.gates.enabled = false;
  config.services.enabled = false;
  return config;
}
