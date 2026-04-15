# EEP Interoperability Guide

> **Whitepaper §11.1–§11.4:** This guide explains how EEP co-exists and interoperates with the Model Context Protocol (MCP), OpenAPI, W3C Agent Network Protocol (ANP), ActivityPub, AT Protocol, and existing enterprise API gateways.

---

## 1. EEP and the Model Context Protocol (MCP)

Anthropic's **Model Context Protocol (MCP)** defines how an LLM or agent accesses tools, resources, and prompts from a local or remote server — the *agent-to-tool* layer.

EEP operates at a **different layer**: it defines how *entities* publish state, broadcast events, and control access at the network level, independent of which model or agent is making the request.

| Aspect | MCP | EEP |
|---|---|---|
| Layer | Agent-to-tool | Entity-to-agent (network) |
| Discovery | Tool list from server | `/.well-known/eep.json` + eep.dev registry |
| Authentication | No native DID auth | DID-based cryptographic identity |
| Payments | Not supported | x402 + on-chain proofs |
| Real-time events | Not native | Layer 2 SSE + Webhooks |
| Bilateral negotiation | Not native | Layer 3 WebSockets + commerce state machine |

### When to use MCP alongside EEP

The two protocols are **complementary, not competing**:

```
┌──────────────────────────────────────────────────────────┐
│  LLM / Agent (orchestrator)                              │
├────────────────┬─────────────────────────────────────────┤
│  MCP           │  EEP                                    │
│  (local tools, │  (remote entities — identity, events,   │
│   prompts,     │   gated access, commerce)               │
│   resources)   │                                         │
└────────────────┴─────────────────────────────────────────┘
```

**Example**: An agent uses MCP to invoke its local `web-search` and `code-runner` tools, and uses EEP to subscribe to a financial data publisher's real-time price feed — paying via x402 and verifying the publisher's EEP Conformance Credential.

See [EEP-MCP-BRIDGE.md](./EEP-MCP-BRIDGE.md) for the production-ready EEP Gateway middleware that wraps MCP servers with EEP-compliant discovery, auth, and payment gating.

---

## 2. EEP and OpenAPI

OpenAPI defines an HTTP service's interface — paths, methods, request bodies, and response schemas.

EEP and OpenAPI address **different dimensions** of the same publisher:

| Aspect | OpenAPI | EEP |
|---|---|---|
| Audience | Human developers | Autonomous agents |
| Purpose | Documents *what* an endpoint does | Documents *how agents discover, authenticate, and access* the entity |
| Access control | API keys / OAuth (human-configured) | DID proofs, VCs, agreements, payments (machine-resolved) |
| Events | Not native | Layer 2 SSE + Webhooks |

An entity can be **fully OpenAPI-documented AND fully EEP-compliant simultaneously**. The OpenAPI spec serves human developers; the `/.well-known/eep.json` manifest serves agents.

**Recommended co-deployment:**
```json
// In /.well-known/eep.json
{
  "did": "did:web:api.example",
  "openapi_url": "https://api.example/openapi.json",
  "layers": {
    "layer1": { "url": "https://api.example/eep/state/{type}/{id}" }
  }
}
```

---

## 3. EEP and W3C Agent Network Protocol (ANP)

The **W3C AI Agent Protocol Community Group** is developing the Agent Network Protocol (ANP), which focuses on agent discovery metadata and cross-domain security vocabularies.

EEP is designed to be **fully semantically compatible** with ANP metadata structures:

- EEP's DID-based identity is the same identity layer ANP references.
- EEP's `/.well-known/eep.json` manifest can be extended with ANP metadata fields.
- EEP's gate credential format (W3C Verifiable Credentials) aligns with ANP's trust assertions.

When ANP specifications stabilize, an EEIP will be authored to formally define the EEP–ANP mapping.

---

## 4. EEP and ActivityPub / AT Protocol

### 4.1 Overview

**ActivityPub** (used by Mastodon/Fediverse) and **AT Protocol** (used by Bluesky) are *social communication protocols*. They define how users follow each other, post content, and federate social graphs across servers. They are **human-centric** by design.

EEP is **agent-centric**. It does not define social constructs (followers, likes, reposts). It defines:
- Sovereign machine identity (DIDs)
- Structured event streaming (SSE/Webhooks)
- Programmable gated access (credentials, payments, agreements)
- Autonomous machine commerce (WebSocket negotiations)

### 4.2 Complementary co-deployment

ActivityPub and AT Protocol publishers CAN expose EEP endpoints **alongside** their existing feeds without abandoning their existing social infrastructure. This makes their content available to agents in structured form while preserving their human-readable social presence.

```
┌────────────────────────────────────────────────────────────┐
│  Publisher (e.g., news organization, researcher)           │
├────────────────────────┬───────────────────────────────────┤
│  ActivityPub endpoint  │  EEP endpoint                     │
│  /inbox, /outbox       │  /.well-known/eep.json            │
│  Human followers       │  Agent subscribers (SSE/WS)       │
│  HTML + JSON-LD        │  JSON/Markdown/TOON               │
│  Manual auth           │  DID-gated (VC, payment, agree.)  │
└────────────────────────┴───────────────────────────────────┘
```

**Concrete example**: A news organization running Mastodon can add an EEP Layer 1 endpoint that returns structured article metadata in Markdown or TOON format, with an SSE stream that emits `content.published` events when new articles are posted. Trading agents and research agents can subscribe to this stream without parsing ActivityPub's Activity Streams 2.0 JSON-LD format.

### 4.3 What agents get by consuming EEP instead of AP/AT

| Capability | ActivityPub | AT Protocol | EEP |
|---|---|---|---|
| Machine-readable structured data | Partial (JSON-LD) | Partial | ✅ TOON/JSON/Markdown |
| Real-time event stream | External (WebSub) | Firehose | ✅ Native SSE |
| DID-based identity | ❌ | ✅ (DIDs via PLC) | ✅ W3C DIDs |
| Gated access (payment, credential) | ❌ | ❌ | ✅ |
| Autonomous commerce | ❌ | ❌ | ✅ Layer 3 WS |
| W3C Verifiable Credentials | ❌ | ❌ | ✅ |
| Privacy-preserving data requests | ❌ | ❌ | ✅ DPV purpose fields |

### 4.4 Implementation pattern for AP/AT publishers adding EEP

An ActivityPub or AT Protocol publisher can add EEP compliance **incrementally**:

**Step 1 — Add the manifest (Core tier):**
```bash
# Serve /.well-known/eep.json
{
  "did": "did:web:mastodon.social",
  "eep_version": "0.1",
  "layers": {
    "layer1": { "url": "https://mastodon.social/eep/state/{type}/{id}" },
    "layer2": { "sse_url": "https://mastodon.social/eep/subscribe" }
  },
  "supported_content_types": ["application/json", "text/markdown"],
  "pqc_ready": false,
  "x402_enabled": false
}
```

**Step 2 — Bridge AP/AT events to EEP CloudEvents format:**
```typescript
// ActivityPub Create activity → EEP content.published event
function apActivityToEepEvent(activity: APActivity): EepEvent {
  return {
    specversion: '1.0',
    type: 'com.example.content.published',
    source: `did:web:${new URL(activity.actor).hostname}`,
    id: activity.id,
    time: activity.published,
    data: {
      title: activity.object?.name,
      url: activity.object?.url,
      summary: activity.object?.summary,
      mediaType: 'text/markdown',
    },
  };
}
```

**Step 3 — Optionally add payment gating** for premium content tiers (Standard/Full conformance).

### 4.5 AT Protocol (Bluesky / atproto) specifics

AT Protocol uses DIDs via PLC (Public Ledger of Credentials) for identity — this is compatible with EEP's DID requirement. An AT Protocol publisher can use their existing `did:plc:...` identifier as their EEP DID, providing a consistent cryptographic identity across both protocols.

```json
// /.well-known/eep.json for an AT Protocol publisher
{
  "did": "did:plc:ewvi7nxzyoun6zhhandbv25m",
  "eep_version": "0.1",
  ...
}
```

---

## 5. EEP and Existing Enterprise API Gateways

Organizations running Kong, Apigee, AWS API Gateway, or similar infrastructure **do not need to replace them** to adopt EEP. EEP can be implemented as a thin middleware or sidecar that wraps existing infrastructure.

### 5.1 EEP compatibility layer responsibilities

A minimal EEP compatibility layer must:

1. **Expose** `/.well-known/eep.json` at the gateway root.
2. **Wrap** existing REST endpoints to respond with EEP-standard Content-Type headers.
3. **Intercept** responses to add `rel="subscribe"` Link headers pointing to the SSE gateway.
4. **Validate** EEP gate proofs (session tokens, VCs, payment hashes) before forwarding requests to the backend, mapping them to existing API key or OAuth scopes.
5. **Transform** backend events to CloudEvents format for the SSE/Webhook stream.

### 5.2 Kong Gateway example

```yaml
# kong-eep-plugin.yaml
_format_version: "3.0"
plugins:
  - name: request-transformer
    config:
      add:
        headers:
          - "Link: <https://api.example/.well-known/eep.json>; rel=\"eep\""
  - name: response-transformer
    config:
      add:
        headers:
          - "Link: <https://api.example/eep/subscribe>; rel=\"subscribe\""

services:
  - name: eep-well-known
    url: http://eep-manifest-service/
    routes:
      - paths: ["/.well-known/eep.json"]
```

### 5.3 AWS API Gateway example

```yaml
# serverless.yml (EEP manifest lambda)
functions:
  eepManifest:
    handler: handlers/eep-manifest.handler
    events:
      - http:
          path: /.well-known/eep.json
          method: get
          cors: true
  eepSubscribe:
    handler: handlers/sse-gateway.handler
    events:
      - http:
          path: /eep/subscribe
          method: get
```

The incremental adoption path means **a company with an existing API can become EEP Core-conformant in a single sprint**, without rewriting their backend.
