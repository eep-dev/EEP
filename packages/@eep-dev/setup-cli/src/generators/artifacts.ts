import type { EEPSetupConfig } from "../types/config.js";

export type GeneratedArtifacts = Record<string, string>;

function toJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildManifest(config: EEPSetupConfig): Record<string, unknown> {
  return {
    did: config.identity.did,
    eep_version: config.identity.eep_versions[0] ?? "0.1",
    eep_versions: config.identity.eep_versions,
    layers: {
      layer1: `${config.identity.base_url}/u/u/default`,
      layer2_sse: config.delivery.methods.includes("sse") ? `${config.identity.base_url}/eep/stream` : undefined,
      layer2_webhook: config.delivery.methods.includes("webhook") ? `${config.identity.base_url}/eep/subscribe` : undefined,
      layer3_ws: config.pulse.enabled ? `${config.identity.base_url.replace(/^http/, "ws")}/eep/pulse` : undefined
    },
    supported_content_types: config.identity.content_types,
    gates_url: `${config.identity.base_url}/eep/gates`,
    services_url: `${config.identity.base_url}/eep/services`,
    pqc_ready: config.security.pqc_ready,
    signing_algorithms: config.security.signing_algorithms,
    compliance: config.compliance,
    x402_enabled: Boolean(config.gates.x402?.enabled)
  };
}

function buildOpenAPI(config: EEPSetupConfig): Record<string, unknown> {
  const eepVersion = config.identity.eep_versions[0] ?? "0.1";
  const linkHeaderDesc = 'Contains rel="subscribe" and rel="monitor" URIs per SPECIFICATION.md §12.1';

  const manifestResponse = {
    description: "EEP platform manifest (eep-manifest.json schema)",
    content: {
      "application/json": {
        schema: { "$ref": `https://eep.dev/schemas/v0.1/eep-manifest.json` }
      }
    }
  };

  const entityHeaders = {
    "EEP-Version": { schema: { type: "string", example: eepVersion }, description: "EEP spec version" },
    "EEP-Entity-DID": { schema: { type: "string" }, description: "DID of the resolved entity" },
    Link: { schema: { type: "string" }, description: linkHeaderDesc }
  };

  const entityResponse = {
    description: "Entity profile with EEP discovery headers",
    headers: entityHeaders,
    content: {
      "application/json": { schema: { type: "object", properties: { id: { type: "string" }, did: { type: "string" }, eep: { type: "object" } } } },
      "text/markdown": { schema: { type: "string" } }
    }
  };

  const gate402 = {
    description: "Payment required (x402 or protocol payment gate)",
    content: { "application/json": { schema: { "$ref": "https://eep.dev/schemas/v0.1/gate.402-response.json" } } }
  };
  const gate403 = {
    description: "Access forbidden (credential or agreement gate)",
    content: { "application/json": { schema: { "$ref": "https://eep.dev/schemas/v0.1/gate.403-response.json" } } }
  };

  const paths: Record<string, unknown> = {
    "/.well-known/eep.json": {
      get: {
        operationId: "manifest",
        summary: "EEP platform manifest (Layer 1 discovery)",
        tags: ["Layer 1"],
        responses: { "200": manifestResponse }
      }
    },
    "/u/{entityType}/{entityId}": {
      get: {
        operationId: "entity",
        summary: "Entity resolution with content negotiation (Layer 1)",
        tags: ["Layer 1"],
        parameters: [
          { name: "entityType", in: "path", required: true, schema: { type: "string" }, description: "Entity type segment (e.g. 'u' for user)" },
          { name: "entityId", in: "path", required: true, schema: { type: "string" }, description: "Entity identifier" },
          { name: "Accept", in: "header", schema: { type: "string", enum: ["application/json", "text/markdown", "text/toon"], default: "application/json" }, description: "Content negotiation per SPECIFICATION.md §3.1" }
        ],
        responses: { "200": entityResponse, "402": gate402, "403": gate403 }
      }
    },
    "/healthz": {
      get: {
        operationId: "health",
        summary: "Health check",
        responses: { "200": { description: "Healthy" } }
      }
    }
  };

  if (config.delivery.methods.includes("webhook")) {
    paths["/eep/subscribe"] = {
      post: {
        operationId: "subscribe",
        summary: "Create webhook subscription (Layer 2)",
        tags: ["Layer 2"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { "$ref": "https://eep.dev/schemas/v0.1/subscription.request.json" } } }
        },
        responses: {
          "201": { description: "Subscription created", content: { "application/json": { schema: { type: "object", properties: { subscription_id: { type: "string" }, delivery_secret: { type: "string" } } } } } }
        }
      }
    };
  }
  if (config.delivery.methods.includes("sse")) {
    paths["/eep/stream"] = {
      get: {
        operationId: "stream",
        summary: "SSE event stream (Layer 2)",
        tags: ["Layer 2"],
        parameters: [
          { name: "source", in: "query", schema: { type: "string" }, description: "Entity source filter" },
          { name: "events", in: "query", schema: { type: "string" }, description: "Comma-separated event type filter" }
        ],
        responses: { "200": { description: "SSE stream", content: { "text/event-stream": {} } } }
      }
    };
  }
  if (config.gates.enabled) {
    paths["/eep/gates"] = {
      get: {
        operationId: "gates",
        summary: "Gate configuration for this publisher",
        tags: ["Gates"],
        responses: { "200": { description: "Gate config", content: { "application/json": { schema: { "$ref": "https://eep.dev/schemas/v0.1/gate.config.json" } } } } }
      }
    };
    paths["/eep/content/{resourcePath}"] = {
      get: {
        operationId: "gatedContent",
        summary: "Access gated content (requires gate proofs)",
        tags: ["Gates"],
        parameters: [
          { name: "resourcePath", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Content delivered" }, "402": gate402, "403": gate403 }
      }
    };
  }
  if (config.services.enabled) {
    paths["/eep/services"] = {
      get: {
        operationId: "services",
        summary: "Service catalog listing",
        tags: ["Services"],
        responses: { "200": { description: "Service listings", content: { "application/json": { schema: { "$ref": "https://eep.dev/schemas/v0.1/service.listing.json" } } } } }
      }
    };
  }
  if (config.pulse.enabled) {
    paths["/eep/pulse"] = {
      get: {
        operationId: "pulse",
        summary: "WebSocket endpoint for Layer 3 bidirectional communication",
        tags: ["Layer 3"],
        responses: { "101": { description: "WebSocket upgrade" } }
      }
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${config.identity.org_name} EEP API`,
      version: eepVersion,
      description: [
        `EEP-compliant API surface for ${config.identity.org_name}.`,
        ``,
        `This document describes THIS deployment. The canonical, protocol-level`,
        `description lives in the EEP repository at schemas/v0.1/openapi.yaml,`,
        `with the event-driven surface (SSE, webhooks, pulse) in`,
        `schemas/v0.1/asyncapi.yaml. Where the two disagree about protocol`,
        `semantics, the canonical documents win — this one exists to record the`,
        `URLs and options you actually deployed.`,
        ``,
        `Spec: https://eep.dev/docs/current/SPECIFICATION.md`
      ].join("\n"),
      license: { name: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" }
    },
    servers: [{ url: config.identity.base_url, description: "Primary EEP endpoint" }],
    tags: [
      { name: "Layer 1", description: "State resolution and discovery" },
      { name: "Layer 2", description: "Signal stream (SSE + webhooks)" },
      { name: "Layer 3", description: "Network pulse (WebSockets)" },
      { name: "Gates", description: "Access gates and gated content" },
      { name: "Services", description: "Service catalog" }
    ],
    paths
  };
}

function buildContractTests(config: EEPSetupConfig): string {
  const lines = [
    "GET {{base_url}}/.well-known/eep.json",
    "HTTP 200",
    "",
    "GET {{base_url}}/u/u/default",
    "HTTP 200",
    ""
  ];
  if (config.delivery.methods.includes("webhook")) {
    lines.push("POST {{base_url}}/eep/subscribe", "HTTP 201", "");
  }
  if (config.delivery.methods.includes("sse")) {
    lines.push("GET {{base_url}}/eep/stream", "HTTP 200", "");
  }
  return `${lines.join("\n")}\n`;
}

export function generateArtifacts(config: EEPSetupConfig): GeneratedArtifacts {
  const manifest = buildManifest(config);
  const serviceCatalog = {
    entity_did: config.identity.did,
    services: config.services.catalog
  };

  return {
    ".well-known/eep.json": toJson(manifest),
    "gate-config.json": toJson({
      default_tier: config.gates.default_tier,
      fallback_behavior: config.gates.fallback,
      tiers: config.gates.tiers,
      x402: config.gates.x402
    }),
    "service-catalog.json": toJson(serviceCatalog),
    "event-types.json": toJson({ events: config.delivery.events }),
    "security-config.json": toJson(config.security),
    "infra/compose.yml": [
      "services:",
      "  eep-node:",
      `    ports: ["${config.infra.ports.node}:3100"]`,
      "  eep-python:",
      `    ports: ["${config.infra.ports.python}:3200"]`,
      ""
    ].join("\n"),
    "runtime/server.ts": "export const runtime = 'node';\n",
    "discovery/dns-instructions.txt": `${config.discovery.dns_txt ?? "v=eep1"}\n`,
    "compliance-declarations.json": toJson(config.compliance),
    "commerce-config.json": toJson({ pricing_mode: config.services.pricing_mode }),
    "operator-policies.json": toJson({
      privacy: { dpv_purpose: config.compliance.dpv_purpose },
      spending: { tier: config.conformance.target_tier }
    }),
    "bridge.config.json": toJson(config.bridge),
    "openapi-eep.json": toJson(buildOpenAPI(config)),
    "eep-contract-tests/basic.hurl": buildContractTests(config),
    "adapter-config.json": toJson(config.adapters)
  };
}
