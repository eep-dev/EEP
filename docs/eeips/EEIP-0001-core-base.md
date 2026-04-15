---
eeip: 1
title: EEP Core Base Protocol
status: Final
type: Standards Track
category: Core
created: 2026-03-05
authors:
  - EEP Standards Committee <standards@eep.dev>
supersedes: ~
replaces: ~
---

# EEIP-0001: EEP Core Base Protocol

## Abstract

This EEIP is a retroactive standards document that formally records the Entity Engagement Protocol (EEP) v0.1 Core Base Protocol. As the foundational protocol EEIP, EEIP-0001 defines the three-layer architecture, the `/.well-known/eep.json` manifest, the gate system, conformance tiers, and the EEIP process itself. All future EEIPs that extend or modify any of these components MUST reference this document.

This EEIP also serves as the canonical **example and template** for the EEIP process defined in SPECIFICATION.md §12 and GOVERNANCE.md. Community participants authoring new EEIPs (extensions, sector profiles, new gate types) SHOULD use this document as their reference.

---

## Motivation

The EEP Core Base Protocol needed a formal EEIP record to:

1. Bootstrap the EEIP process with a reference implementation
2. Create an immutable, versioned record of the v0.1 protocol definition
3. Demonstrate the EEIP lifecycle from Draft → Review → Accepted → Final
4. Enable future EEIPs to formally "extend" or "supersede" specific sections by referencing EEIP-0001

---

## Specification

### 1. The Three-Layer Architecture

EEP defines three protocol layers, each providing increasing interaction depth:

| Layer | Name | Transport | Description |
|---|---|---|---|
| **Layer 1** | State | HTTPS REST | `GET /.well-known/eep.json` + state endpoints. Read-only, pull-based. |
| **Layer 2** | Events | SSE / Webhooks | Push-based event streaming. Agents subscribe to entity state changes. |
| **Layer 3** | Pulse | WebSocket | Full-duplex bidirectional real-time protocol for commerce, agreements, and delegated task coordination. |

An entity is EEP-compatible if and only if it exposes a valid `/.well-known/eep.json` manifest linked to a W3C DID Document.

### 2. The Manifest (`/.well-known/eep.json`)

The manifest is the machine-readable identity card of an EEP entity. Schema: `schemas/v0.1/eep-manifest.json`.

**Normative required fields:**

| Field | Type | Description |
|---|---|---|
| `did` | string | W3C DID (`did:web:...`, `did:key:...`) |
| `eep_version` | string | Protocol version (e.g., `"0.1"`) |
| `layers` | object | `layer1` URL required; `layer2_sse`, `layer2_webhook`, `layer3_ws` optional |
| `supported_content_types` | array | MIME types: `application/json`, `text/markdown`, `text/toon` |
| `pqc_ready` | boolean | Post-Quantum Cryptography readiness flag |
| `x402_enabled` | boolean | Whether x402 payment rail is accepted |

### 3. The Gate System

Gates are access control requirements at Layer 1 endpoints. When an agent accesses a gated resource:

1. Publisher returns `HTTP 402` or `HTTP 403` with a `gate.402-response.json` or `gate.403-response.json` body
2. The body lists the required proof(s) in `requirements`
3. Agent satisfies the requirement and re-presents with the proof in the request
4. Publisher verifies the gate proof using `gate.proof.json` schema rules
5. On success: publisher issues a `session.token.json` and returns the resource

**Gate types defined in EEIP-0001:**

| Type | Description | Schema |
|---|---|---|
| `credential` | W3C Verifiable Credential presentation | `gate.proof.json#credential` |
| `identity` | DID signature challenge-response | `gate.proof.json#identity` |
| `payment` | On-chain payment proof (tx hash) or x402 | `gate.proof.json#payment` |
| `agreement` | Signed legal agreement hash | `gate.proof.json#agreement` |
| `data_request` | W3C VP over requested data claims | `gate.proof.json#data_request` |
| `proof_of_intent` | PoI document signed by human principal | `gate.proof.json#proof_of_intent` |
| `combined` | Multiple gate types in conjunction | `gate.proof.json#combined` |
| `public` | No gate — open access | — |

### 4. Conformance Tiers

Per Whitepaper §10.2, three conformance tiers are defined:

| Tier | Requirements |
|---|---|
| **Core** | Layer 1 (`/.well-known/eep.json`) + Layer 2 SSE + valid DID Document + content negotiation |
| **Standard** | Core + Layer 2 Webhooks + credential/identity/payment gates + EEP version negotiation |
| **Full** | Standard + Layer 3 WebSocket + commerce state machine + agreement + data_request gate + session persistence + W3C DPV compliance |

No other tiers are defined in this or any subsequent EEIP. Legacy tier names from pre-release drafts are not normative and MUST NOT be used in conformance assertions.

### 5. The EEIP Process

Any party may author an EEIP. The lifecycle is:

```
Draft → Review (public comment, minimum 14 days)
     → Accepted (Standards Committee vote, ≥2/3 majority)
     → Final (reference implementation confirmed)

OR   → Rejected (failed vote or withdrawn)

Final → Deprecated (superseded by a newer EEIP)
```

EEIP numbers are assigned sequentially by the Standards Committee. EEIPs are submitted as pull requests to the EEP GitHub repository under `docs/eeips/`.

---

## Rationale

The three-layer design was chosen to enable incremental adoption: entities can start with Layer 1-only (Core conformance) and progressively add event streaming (Standard) and real-time commerce (Full) as their needs evolve. This matches how real-world API consumers adopt protocols.

The gate system was designed to be **extensible without breaking changes**: new gate types can be added by a new EEIP without modifying the base gate machinery. The `combined` gate type enables arbitrary conjunctions of existing types.

---

## Backwards Compatibility

EEIP-0001 is the genesis protocol. All future EEIPs that change normative behavior MUST declare backwards compatibility impact in their `replaces:` and `supersedes:` frontmatter.

---

## Security Considerations

All security requirements of EEIP-0001 are normatively defined in:

- `docs/current/security.md` — threat model and controls
- `SPECIFICATION.md §9` — security requirements
- `WHITEPAPER.tex §10` — cryptographic design rationale

Key normative requirements (informative summary):
- TLS 1.3+ mandatory on all EEP endpoints
- All gate proofs must be DID-signed with nonce + 60-second `iat` window
- Nonces must be single-use (replay prevention)
- Gate verification must be constant-time (side-channel prevention)

---

## Reference Implementation

The reference implementation of EEIP-0001 is the `@eep-dev/gates` package:

- `packages/@eep-dev/gates/src/` — gate validators, POI validator, proof validator
- `schemas/v0.1/` — all normative JSON schemas
- `docs/current/SPECIFICATION.md` — complete normative specification
- `examples/` — Node.js and Python implementation examples

---

## Copyright

This EEIP is placed in the public domain under the CC0 1.0 Universal License. The EEP Standards Committee waives all copyright and related rights to this work.
