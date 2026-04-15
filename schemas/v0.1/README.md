# EEP Schemas — v0.1

This directory contains **24** JSON Schema files (`*.json`) for EEP v0.1. The table below lists the primary protocol surfaces; additional schemas cover registry federation, credentials, privacy, sessions, HTTP error bodies, and audit logging (see filenames in this folder).

---

## Schema index (primary)

| Schema | Purpose | Used by |
|--------|---------|---------|
| [`event.envelope.json`](./event.envelope.json) | CloudEvents v1.0.2 superset with EEP extension attributes (`eep_version`, `eep_subscription_id`, `eep_trust_score`, `eep_actor_type`, `eep_tier`). | Publishers, subscribers, `@eep-dev/compliance-cli` |
| [`subscription.request.json`](./subscription.request.json) | Validates subscription creation requests. Conditionally requires `delivery_url` for webhooks. Supports optional `tier` and `gate_proofs` for gated subscriptions. | Publisher API layer |
| [`delivery.payload.json`](./delivery.payload.json) | Extends the event envelope with webhook-specific fields (`eep_subscription_id` required, `eep_delivery_attempt`). Uses `$ref` to inherit all event envelope constraints. | Publisher webhook dispatcher |
| [`ws-message.json`](./ws-message.json) | WebSocket message envelope for Layer 3 (Network Pulse). Includes `commerce.dispute.*` and conditional branches for `auth_expiring`, `auth_refresh`, and `replay`. For **runtime validation**. | Publisher WebSocket handler |
| [`eep-pulse-message-schema.json`](./eep-pulse-message-schema.json) | Network Pulse message types via `$defs` and `oneOf`. For **documentation and code generation**. | SDK generators, docs |
| [`gate.config.json`](./gate.config.json) | Gate tier definitions including `combined` requirements and extensible requirement types. | Publisher gate endpoints, `@eep-dev/gates` |
| [`gate.proof.json`](./gate.proof.json) | Proof structures submitted to satisfy gate requirements. | Subscriber agents, `@eep-dev/gates` |
| [`gate.402-response.json`](./gate.402-response.json) | Machine-readable HTTP 402 response body. | Publisher 402 handler, `@eep-dev/gates` |
| [`gate.403-response.json`](./gate.403-response.json), [`gate.429-response.json`](./gate.429-response.json), [`gate.451-response.json`](./gate.451-response.json) | Structured HTTP error bodies for gate-related responses. | Publishers, compliance tooling |
| [`commerce.negotiation.json`](./commerce.negotiation.json) | Pricing models, negotiation terms, invoice, and receipt objects. | WebSocket commerce handler, `@eep-dev/gates` |
| [`service.listing.json`](./service.listing.json) | Service catalog with per-service pricing and metadata. | Publisher service endpoints, `@eep-dev/gates` |
| [`eep-manifest.json`](./eep-manifest.json) | Entity discovery manifest. | Layer 1 discovery |
| [`eep-registry.json`](./eep-registry.json) | Federation registry manifest; optional `economics` metadata (see CHANGELOG v0.1). | Registry operators |
| [`delegation.proof.json`](./delegation.proof.json) | Delegation credential subject; may include `operator_privacy_policy_hash`, `allowed_dpv_purposes`, `max_retention_days`. | Trust and privacy alignment |
| [`registry.search-result.json`](./registry.search-result.json) | Registry search API shapes. | Federation |
| [`conformance.credential.json`](./conformance.credential.json), [`agent.wallet.json`](./agent.wallet.json), [`operator.spending-policy.json`](./operator.spending-policy.json), [`operator.privacy-policy.json`](./operator.privacy-policy.json), [`session.token.json`](./session.token.json), [`data.withdrawal.json`](./data.withdrawal.json) | Wallet, credentials, operator policies, sessions, data withdrawal. | Reference APIs and gates |
| [`audit-log.json`](./audit-log.json) | Audit log entries including gate event types. | Operators |

---

## Two WebSocket Schemas — Why?

The directory has two schemas for WebSocket messages. This is intentional:

- **`ws-message.json`** is flat and validation-focused. Use it in your WebSocket handler to validate incoming messages at runtime. It uses conditional `allOf`/`if`/`then` for message-type-specific validation.

- **`eep-pulse-message-schema.json`** is structured and documentation-focused. Named `$defs` (`SystemMessage`, `EntityMessage`, `A2AMessage`, `ChatMessage`, `CommerceMessage`) map to code-level types. Use it for generating TypeScript interfaces or API docs.

Both schemas are consistent with each other and with SPECIFICATION.md §6.

---

## Versioning

All schemas in this directory correspond to **EEP v0.1** (see [CHANGELOG.md](../../CHANGELOG.md)). When the specification version changes, a new directory (e.g., `v0.2/`) will be created alongside this one.
