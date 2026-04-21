# Why EEP? The vision behind the protocol

## The problem: the web was built for reading, not acting

The original web was designed as a document delivery system. A human types a URL, a server sends back an HTML page, and the human reads it. The client has to ask for data, resulting in a snapshot of what was true at the moment of asking.

This works when humans read web pages. If the data is stale, they refresh.

An AI agent cannot poll manually. An agent monitoring 10,000 supplier profiles for price changes or stock updates makes decisions on stale data if it only checks hourly. It misses critical updates and fails its user.

The human web was built for human readers. The agentic web needs a different approach.

---

## The solution: push-first, event-driven entity communication

EEP defines a simple contract:

> Any digital entity (a business, a person, a product, an AI agent) can publish a real-time stream of state changes. Any authorized subscriber (human or machine) can receive those changes the moment they happen.

Event-driven systems have powered financial markets, logistics networks, and IoT devices for decades. EEP brings that reliability to internet identities.

---

## What counts as an "entity"?

EEP is entity-agnostic. An entity has:
1. A stable identity (a DID, a URL, a username)
2. State that can change over time
3. A need to notify others when that state changes

Examples:
- A freelancer profile: trust score goes up, new skill verified
- A SaaS product: pricing tier changes, new integration published
- A supply chain node: inventory drops below threshold, shipment delayed
- A DAO: governance vote passes, treasury balance changes
- An AI agent: deployment updated, capability added, task completed

---

## The three layers of EEP

EEP defines three layers to handle different transport needs:

### Layer 1: state resolution (REST)

HTTP REST APIs handle discovery. Any agent can `GET /u/acme-corp` and receive a structured profile with capabilities, trust score, and a DID document. This layer is stateless, cacheable, and universally accessible.

### Layer 2: signal stream (SSE + Webhooks)

Entities publish events as CloudEvents-compliant JSON payloads. Subscribers choose their preferred delivery mechanism:
- Webhooks: the platform POSTs events to the subscriber's URL
- SSE: the subscriber opens a long-lived HTTP connection and receives a real-time stream

This layer is unidirectional (platform to subscriber) and persistent.

### Layer 3: network pulse (WebSockets)

Network pulse handles bidirectional, interactive scenarios like A2A task execution, agent-to-entity live negotiation, and collaborative editing. This layer is stateful, bidirectional, and latency-sensitive. It includes per-entity sequence tracking, gap detection, replay support, and JWT re-authentication for long-lived connections.

---

## Who is EEP for?

### Platform developers
You build a platform where entities live, like a marketplace, a registry, a professional network, or a data provider. EEP gives your platform's entities a standard event channel that any AI agent can subscribe to without bespoke integrations for each protocol.

### AI agent developers
Your agent monitors entities, reacts to state changes, and takes actions. EEP gives your agent a widespread subscription API that works across any EEP-compliant platform.

### Enterprise architects
You design real-time data pipelines between organizational entities. EEP provides a vendor-neutral event bus that doesn't lock you into a single cloud provider's messaging product.

---

## Design principles

| Principle | What It Means |
|-----------|---------------|
| **Open** | No proprietary lock-in. The spec uses the Apache 2.0 license. Anyone can implement it. |
| **Composable** | Use all three layers or just one. EEP layers are independent. |
| **Secure by default** | Every webhook is signed. Every SSE stream is authenticated. Security is mandatory. |
| **Agent-native** | Events are structured for machine consumption first. Human-readable docs are secondary. |
| **CloudEvents-compatible** | EEP event envelopes are a superset of CloudEvents v1.0.2. CloudEvents consumers can parse EEP events. |
| **Interoperable** | EEP events bridge to A2A, MCP, and AG-UI without data transformation. |

---

## Where EEP fits

EEP is a protocol in its own right and should not be treated as a replacement for other standards with different responsibilities.

| Protocol | Primary Scope | Pattern |
|---|---|---|
| **EEP** | Agent-to-entity engagement | `agent <-> entity` |
| **MCP** | Tool and resource invocation | `agent <-> tool` |
| **A2A** | Agent delegation | `agent <-> agent` |
| **ANP** | Decentralized agent network coordination | `agent <-> agent` |

See `docs/guides/protocol-positioning-matrix.md` for a concise positioning matrix and rollout guidance.

---

## Operational readiness baseline

For production implementations, pair the protocol docs with operational baselines:

- `docs/ops/slo.md`
- `docs/ops/incident-response.md`
- `docs/ops/runbook-webhook-delivery.md`
- `docs/ops/observability.md`

---

## Adoption playbooks

For institution/project onboarding and automation-first rollout:

- `docs/guides/enterprise-implementation-playbook.md`
- `docs/guides/agent-onboarding.md`
- `docs/strategy/` — day-0 GTM, unmet-needs map, distribution checklist, screencast runbook
- `registry/adopters.json` — public seed list (static; eep.dev/adopters)
- [AGENTS.md](../AGENTS.md) — coding-agent entry (repo root)

---

## Bridge and reference deployment

- `docs/guides/mcp-eep-bridge.md`
- `docs/guides/reference-deployment-eep-api.md`

---

## Standards track

- `docs/standards/ietf-w3c-readiness-roadmap.md`
