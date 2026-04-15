# EEP-MCP Bridge

**Status:** Design Specification  
**Version:** 0.1-draft

---

## Overview

The **EEP Gateway** is open-source middleware that wraps any existing Model Context Protocol (MCP) server and surfaces its capabilities through the Entity Engagement Protocol. This enables MCP developers to instantly benefit from EEP's Zero-Trust authentication, x402 payment gating, and real-time event streaming — without modifying a single line of MCP server code.

This document describes the bridge architecture, the translation layer, and the integration flow.

## Agent-native integration profile

The bridge should expose no UI dependency for operational flows. All critical actions must be API-first.

### Required gateway invariants

- `GET /.well-known/eep.json` always available.
- `GET /eep/services` always machine-parseable JSON.
- `POST /eep/subscribe` deterministic status model (`pending_verification|active|rejected`).
- `POST /mcp/tools/call` returns structured 402 body for unmet gates.

### Minimum compatibility test bundle

```bash
curl -fsS "http://localhost:3001/.well-known/eep.json" | jq '.did,.layers'
curl -fsS "http://localhost:3001/eep/services" | jq '.services[0].id'
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001/mcp/tools/call"
```

---

## Architecture

```
                ┌─────────────────────────────────────┐
                │           EEP GATEWAY               │
                │                                     │
  EEP Agent ───▶│  ┌──────────────┐                  │
  (DID, x402)   │  │ Auth Layer   │  DID verify       │
                │  │ (Zero-Trust) │  x402 settle      │
                │  └──────┬───────┘                   │
                │         │ translated request         │
                │  ┌──────▼───────┐  /.well-known      │
                │  │  MCP Bridge  │  eep.json built    │
                │  │  Translator  │  dynamically       │
                │  └──────┬───────┘                   │
                │         │ stdio / HTTP               │
                └─────────┼───────────────────────────┘
                          │
                 ┌────────▼────────┐
                 │   MCP SERVER    │
                 │ (unchanged code)│
                 └─────────────────┘
```

---

## MCP Tool Catalog → EEP Manifest Translation

The Gateway introspects the MCP server's `tools/list` and `resources/list` endpoints and automatically builds the `/.well-known/eep.json` manifest, service catalog, and gate configuration.

### MCP Tool → EEP Service Listing Crosswalk

| MCP Field | EEP Field | Schema Location |
|---|---|---|
| `server.name` | `did` (generated: `did:web:<host>:mcp:<server-name>`) | `eep-manifest.json#did` |
| `server.version` | `eep_version` | `eep-manifest.json#eep_version` |
| `tools[].name` | `ServiceListing.id` | `service.listing.json#id` |
| `tools[].description` | `ServiceListing.description` | `service.listing.json#description` |
| `tools[].inputSchema` | `ServiceListing.metadata.input_schema` | `service.listing.json#metadata` |
| `tools[].annotations.title` | `ServiceListing.name` | `service.listing.json#name` |
| `tools[].annotations.readOnlyHint: true` | gate `type: "public"` (no auth required for reads) | `gate.config.json#type` |
| `tools[].annotations.destructiveHint: true` | gate `type: "agreement"` (requires signed ack) | `gate.config.json#type` |
| `tools[].annotations.price_usd` *(custom)* | gate `type: "payment"`, `amount: <value>`, `currency: "USD"` | `gate.config.json#payment` |
| `tools[].annotations.required_credential` *(custom)* | gate `type: "credential"`, `credential_type: <value>` | `gate.config.json#credential` |

### MCP Resource → EEP Layer 1 Endpoint Crosswalk

| MCP Concept | EEP Concept | Notes |
|---|---|---|
| `resources[].uri` | `layers.layer1` endpoint path | Static resources → REST GET endpoints |
| `resources[].mimeType` | `supported_content_types[]` | Added to manifest content type array |
| `resources[].name` | Resource route label in `ServiceListing` | |
| Resource subscription | `layers.layer2_sse` (auto-generated SSE stream) | Gateway creates SSE stream for resource updates |

### Auto-generated Gate Configuration

When `gateway.config.json` specifies gated tools, the Gateway generates the corresponding `gate.config.json` entries:

```json
{
  "version": "0.1",
  "gates": [
    {
      "path": "/mcp/tools/call",
      "method": "POST",
      "requirements": [
        {
          "type": "payment",
          "amount": 1.00,
          "currency": "USD",
          "x402": {
            "enabled": true,
            "facilitator_url": "https://x402.org/facilitator",
            "payment_rails": ["x402/usdc"],
            "network": "base"
          }
        }
      ],
      "tool_filter": { "name": "get_daily_briefing" }
    }
  ]
}
```

### Auto-generated Manifest Example

Given an MCP server at `mcp.bloomberg.com` with a tool `get_daily_briefing`, the Gateway generates:

```json
{
  "did": "did:web:mcp.bloomberg.com:mcp:bloomberg-data",
  "eep_version": "0.1",
  "layers": {
    "layer1": "https://mcp.bloomberg.com/.well-known/eep.json",
    "layer2_sse": "https://mcp.bloomberg.com/eep/stream"
  },
  "supported_content_types": ["application/json"],
  "services_url": "https://mcp.bloomberg.com/eep/services",
  "x402_enabled": false,
  "pqc_ready": false,
  "updated_at": "2026-03-05T05:00:00Z"
}
```

---

## DID Injection Flow

The Gateway handles all DID-based authentication on behalf of the wrapped MCP server:

1. EEP agent sends request with `Authorization: DID {did} {signature}`
2. Gateway verifies the DID signature against the DID Document
3. If verified, Gateway forwards the request to the MCP server with a legacy API key (if configured)
4. Response is returned to the EEP agent unchanged

The MCP server never sees DIDs — it just receives authenticated requests.

---

## x402 Payment Gate Wrapping

For MCP tools that should be monetised, the Gateway injects a payment gate:

1. Define a `gateway.config.json` specifying which MCP tools require payment:

```json
{
  "gated_tools": {
    "get_daily_briefing": {
      "type": "payment",
      "amount": 1,
      "currency": "USDC",
      "per": "request",
      "x402": {
        "enabled": true,
        "facilitator_url": "https://x402.org/facilitator",
        "payment_rails": ["x402/usdc"],
        "network": "base"
      }
    }
  }
}
```

2. When an agent hits a gated tool without payment proof, Gateway returns `402` with the standard `gate.402-response.json` body.
3. Agent obtains an x402 payment payload and retries.
4. Gateway verifies the on-chain payment via the x402 facilitator and forwards the request.

---

## Quick Start

```bash
# Install
npm install -g @eep-dev/gateway

# Wrap an MCP server
eep-gateway start \
  --mcp-command "npx -y @modelcontextprotocol/server-filesystem /data" \
  --port 3001 \
  --did "did:web:mygateway.example.com" \
  --gateway-config ./gateway.config.json
```

The Gateway is now listening on `http://localhost:3001` and serving:
- `GET /.well-known/eep.json` — auto-generated manifest
- `GET /eep/services` — tool catalog as EEP services
- `POST /eep/subscribe` — SSE subscription
- All original MCP endpoints — proxied with Zero-Trust auth

---

## Relationship to EEP

The EEP Gateway is the **missing economic network layer for MCP**, not its competitor. MCP handles tool execution; EEP handles discovery, identity, and monetisation. Together they form a complete agentic infrastructure stack.
