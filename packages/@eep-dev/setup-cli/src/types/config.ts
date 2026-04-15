export type ConformanceTier = "Core" | "Standard" | "Full";
export type RuntimeTarget = "node" | "python" | "dual" | "other";
export type SetupMode = "init" | "inject";

export type EEPSetupConfig = {
  setup_schema_version: string;
  mode: SetupMode;
  identity: {
    org_name: string;
    domain: string;
    did: string;
    base_url: string;
    eep_versions: string[];
    content_types: string[];
  };
  conformance: {
    target_tier: ConformanceTier;
    environment: "development" | "staging" | "production";
    runtime: RuntimeTarget;
  };
  entities: {
    types: string[];
    samples: Array<{ type: string; id: string }>;
  };
  discovery: {
    well_known: boolean;
    link_header: boolean;
    dns_txt?: string;
    agent_card: {
      enabled: boolean;
      anp_compatible: boolean;
    };
  };
  delivery: {
    methods: Array<"sse" | "webhook">;
    events: string[];
  };
  gates: {
    enabled: boolean;
    default_tier: string;
    fallback: "restrict" | "default";
    tiers: Record<string, { requirements: unknown[]; access: string[] }>;
    x402?: {
      enabled: boolean;
      facilitator_url?: string;
      payment_rails?: string[];
      network?: string;
    };
  };
  services: {
    enabled: boolean;
    pricing_mode: "fixed" | "negotiable" | "auction";
    catalog: unknown[];
  };
  security: {
    signing_algorithms: string[];
    pqc_ready: boolean;
    tls_mode: "standard" | "mTLS" | "mTLS-required";
    forward_secrecy: boolean;
    strict_fail_closed: boolean;
  };
  pulse: {
    enabled: boolean;
    chat: boolean;
    commerce_state_machine: boolean;
    session_tokens: boolean;
    audit_log: boolean;
  };
  compliance: {
    eu_ai_act: boolean;
    gdpr: boolean;
    dora: boolean;
    data_residency: string;
    dpv_purpose: string;
  };
  infra: {
    postgres: string;
    redis: string;
    ports: {
      node: number;
      python: number;
    };
    compose: boolean;
  };
  bridge: {
    enabled: boolean;
    mcp_server_url?: string;
  };
  adapters: {
    auth: {
      type: "jwt_claims" | "api_key_lookup" | "oauth_scopes" | "custom";
      did_claim?: string;
      tier_claim?: string;
    };
    database: {
      type: string;
      shared: boolean;
    };
    event_bus: {
      type: string;
      shared: boolean;
    };
    framework: {
      type: string;
      mount_path: string;
    };
  };
};
