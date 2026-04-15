# @eep-dev/gates

> **Access control, commerce negotiation, and service discovery for the Entity Exchange Protocol.**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../../docs/current/SPECIFICATION.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../../LICENSE)
[![Tests](https://img.shields.io/badge/Tests-446%20passing-brightgreen)](#tests)

---

## Overview

`@eep-dev/gates` is the core package of EEP's access control layer. It implements the **Gate System** defined in the Whitepaper (§3.4, §7, §8) — allowing entity owners to define tiered access requirements and enabling agents to prove eligibility through structured proofs.

### Key Capabilities

| Module | Description | Whitepaper |
|--------|-------------|------------|
| Gate Config | Parse, validate, and serialize gate configurations | §3.4 |
| Access Resolution | Determine access tier from proofs + requirements | §3.4 |
| Proof Validation | Structural validation, nonce replay prevention, double-spend detection | §10 |
| HTTP 402/429 | Build EEP-compliant payment-required and rate-limit responses | §3.4, §9 |
| Commerce | State machine for negotiation flows (offer → counter → accept → invoice → paid) | §8 |
| Service Listing | Validate service catalogs, listings, and reviews | §15 |
| Proof-of-Intent | Validate PoI documents and scope verification | G4 |
| Request Headers | Validate EEP-specific request/response headers | G24 |

## Installation

```bash
npm install @eep-dev/gates
```

## Quick Start

```typescript
import {
  parseGateConfig,
  resolveAccess,
  build402Response,
  ProofVerifierRegistry,
} from '@eep-dev/gates';

// 1. Parse gate configuration
const config = parseGateConfig(entityGateJson);
if (!config.valid) throw new Error(config.errors.join(', '));

// 2. Register platform-specific proof verifiers
const registry = new ProofVerifierRegistry();
registry.register({
  supportedTypes: ['payment'],
  verify: async (proof, req) => proof.token?.startsWith('tok_'),
});

// 3. Resolve access
const result = await resolveAccess(agentProofs, config.config, 'content.papers', registry);

if (!result.granted) {
  // Build RFC-compliant 402 response with unmet requirements
  const body = await build402Response(config.config, 'content.papers', agentProofs);
  return c.json(body, 402);
}

// Access granted: result.tier contains the matched tier name
console.log(`Access granted at tier: ${result.tier}`);
```

## API Reference

### Gate Configuration

```typescript
// Parse and validate a raw gate config JSON
const { valid, config, errors } = parseGateConfig(rawJson);

// Serialize back to JSON
const json = serializeGateConfig(config);

// Get all requirement types used in config
const types = getUsedRequirementTypes(config); // ['payment', 'trust', ...]
```

### Access Resolution

```typescript
// Resolve which tier the agent qualifies for
const result = await resolveAccess(proofs, gateConfig, resourcePath, registry);
// result: { granted: boolean, tier?: string, unmet?: UnmetRequirement[] }
```

`resolveAccess()` now defaults to strict fail-closed semantic verification.  
If no verifier is registered for a requirement type, that requirement is treated as unmet.  
For controlled migration scenarios only, you can disable strict mode with:

```typescript
await resolveAccess(proofs, gateConfig, resourcePath, registry, {
  strictSemanticVerification: false,
});
```

### Proof Validation

```typescript
// Structural validation (type, required fields)
const structResult = validateProofStructure(proof);

// Register custom verifiers for semantic validation
const registry = new ProofVerifierRegistry();
registry.register({
  supportedTypes: ['payment', 'credential'],
  verify: async (proof, requirement) => { /* platform logic */ },
});

// Nonce replay prevention (G29)
const nonceStore = new InMemoryNonceStore();
const nonceResult = await validateProofWithNonce(proof, nonceStore);

// Double-spend prevention (G32)
const hashStore = new InMemoryPaymentHashStore();
const dsResult = await validatePaymentProofForDoubleSpend(proof, hashStore);

// Multi-chain payment validation (G27)
const chainResult = validatePaymentChain(proof, declaredNetworks);
```

### HTTP Responses

```typescript
// Build 402 Payment Required response
const body402 = await build402Response(gateConfig, resourcePath, agentProofs);

// Build 429 Rate Limited response
const body429 = build429Response({ retryAfterSeconds: 60, didKey: agentDid });

// Check if a resource path is gated
const isGated = isGatedResource(gateConfig, 'content.papers.full_text');
```

### Commerce State Machine

```typescript
import { transition, getValidActions, isTerminal } from '@eep-dev/gates';

// Validate a state transition
const result = transition('idle', 'offer');
// { valid: true, from: 'idle', to: 'offer', allowed: [...] }

// Get valid next actions from current state
const actions = getValidActions('offer'); // ['counter', 'accept', 'reject']

// Check if state is terminal
isTerminal('paid');     // true
isTerminal('rejected'); // true
isTerminal('offer');    // false
```

### Service Listing

```typescript
import { validateServiceListing, validateServiceCatalog, validateReview } from '@eep-dev/gates';

const listingResult = validateServiceListing(listing);
const catalogResult = validateServiceCatalog(catalog);
const reviewResult = validateReview(review);
```

### Request Header Validation (G24)

```typescript
import { validateRequestHeaders } from '@eep-dev/gates';

const result = validateRequestHeaders(headers);
// Validates: EEP-Version, EEP-DID, EEP-Nonce, EEP-Timestamp
```

## Gate Types

EEP supports these requirement types, extensible via `x-*` prefix:

| Type | Description | Proof Contains |
|------|-------------|----------------|
| `payment` | Payment gate (x402, Stripe, crypto) | `token`, `amount`, `currency` |
| `trust` | Trust score threshold | `score`, `attestation` |
| `identity` | Identity verification | `method`, `did_proof` |
| `credential` | Verifiable Credential | `credential`, `format` |
| `connection` | Social graph / follow | `connection_type` |
| `capability` | Agent capability check | `capabilities[]` |
| `allowlist` | Allowlist membership | `did` |
| `reciprocal` | Mutual subscription | `subscription_proof` |
| `data_request` | W3C DPV data exchange (§7) | `verifiable_presentation` |
| `agreement` | License agreement (§8) | `license_hash`, `signature` |

## Tests

446 tests across 12 test files:

```bash
npx vitest run
```

| Test File | Tests | Coverage |
|-----------|-------|----------|
| gate-config.test | Config parsing, validation, serialization |
| access-resolver.test | Access resolution, tier matching |
| proof-validator.test | Structure, nonce, double-spend, headers |
| commerce.test | State machine transitions, pricing |
| service-listing.test | Catalog, listing, review validation |
| security.test | Injection, overflow, boundary checks |
| poi.test | Proof-of-Intent validation |
| g24-g31.test | Request headers, sessions, wallets, RFP |
| bench.test | Performance benchmarks |

## License

Apache-2.0 — see [LICENSE](../../../LICENSE)
