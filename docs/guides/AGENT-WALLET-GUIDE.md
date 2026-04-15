# EEP Agent Wallet Guide

> **Reference:** Whitepaper §8 — Wallet Infrastructure & Key Storage Models
> **Schema:** [`schemas/v0.1/agent.wallet.json`](../../schemas/v0.1/agent.wallet.json)

This guide explains how agents bind their operational DID to a cryptographic key store. EEP defines three binding models ordered from most to least operator-controlled.

---

## Overview

Every EEP agent uses a **DID** (Decentralized Identifier) as its cryptographic identity. The DID's private key is used to sign gate proofs, delegation credentials, and request headers (`EEP-Signature`). The **wallet binding model** determines *where* and *how* that private key is stored and used.

```
Agent (DID: did:web:agent.acme.corp)
        │
        ├── Signs: EEP-Signature header
        ├── Signs: Gate proof submissions
        ├── Signs: Delegation credentials (sub-agents)
        └── Key stored in: [OS Keychain | TEE/HSM | BIP-32 HD]
```

---

## Model 1: Operator-Derived (BIP-32 HD)

**Best for:** Cloud agents, server-side automation, multi-agent deployments run by a single operator.

The operator holds a **master seed** (BIP-39 mnemonic) and derives agent keys using BIP-32 Hierarchical Deterministic derivation. Each agent gets a unique path.

```
Master Seed: "word1 word2 ... word24"
    │
    ├── m/44'/60'/0'/0/0  → Agent "sales-bot" DID
    ├── m/44'/60'/1'/0/0  → Agent "support-bot" DID
    └── m/44'/60'/2'/0/0  → Agent "analytics-bot" DID
```

### Wallet Declaration

```json
{
  "agent_did": "did:web:agent.acme.corp:sales",
  "binding_model": "operator_derived",
  "key_type": "Ed25519",
  "created_at": "2026-03-05T10:00:00Z",
  "rotation_policy": { "max_age_days": 90, "auto_rotate": false },
  "operator_derived_config": {
    "derivation_path": "m/44'/60'/0'/0/0",
    "master_did": "did:web:acme.corp"
  },
  "operator_did": "did:web:acme.corp"
}
```

### Key Rotation

Rotate using a new derivation path: `m/44'/60'/0'/0/1` → publish DID document update. EEP recommends 90-day maximum key age.

### Security Trade-offs

| Advantage | Risk |
|---|---|
| Central key management | Master seed compromise = all agents compromised |
| Easy to scale | Requires secure seed storage (HSM recommended for seed) |
| Operator can revoke instantly | Requires key rotation on staff turnover |

---

## Model 2: Hardware-Isolated (TEE/HSM)

**Best for:** High-value agents, payment authorization, enterprise deployments requiring regulatory compliance.

The private key is generated inside a secure hardware boundary (TPM, Intel SGX, AWS Nitro Enclaves, PKCS#11 HSM) and **never leaves the hardware**. All signing operations happen inside the enclave.

### Wallet Declaration

```json
{
  "agent_did": "did:web:agent.secure.corp:payment",
  "binding_model": "hardware_isolated",
  "key_type": "ML-DSA-65",
  "created_at": "2026-03-05T10:00:00Z",
  "rotation_policy": { "max_age_days": 365, "auto_rotate": false },
  "hardware_config": {
    "hardware_type": "aws_nitro_enclaves",
    "attestation_endpoint": "https://attest.secure.corp/v1/report"
  },
  "pqc_ready": true,
  "operator_did": "did:web:secure.corp"
}
```

### Supported Hardware Types

| Value | Hardware |
|---|---|
| `tpm_2.0` | TPM 2.0 chip |
| `aws_nitro_enclaves` | AWS Nitro Enclaves |
| `azure_confidential_computing` | Azure CVM |
| `gcp_confidential_vm` | GCP Confidential VM |
| `hsm_pkcs11` | PKCS#11 Hardware Security Module |
| `sgx` | Intel Software Guard Extensions |
| `trustzone` | ARM TrustZone |

### Remote Attestation

The `attestation_endpoint` provides signed quotes (DCAP/RATS) that publishers can optionally verify before granting high-privilege access. Publishers request attestation via:

```
GET {attestation_endpoint}?nonce={publisher_nonce}
→ Returns: signed attestation report (AWS GetAttestationDocument or Intel SGX quote)
```

### Security Trade-offs

| Advantage | Risk |
|---|---|
| Key never extractable | TEE vulnerabilities (Spectre, SGX side-channels) |
| Hardware attestation proves environment integrity | Hardware vendor trust dependency |
| Best for post-quantum key types (ML-DSA) | Higher operational complexity |

---

## Model 3: OS Keychain

**Best for:** Desktop agents, mobile apps, individual developer agents, low-to-medium risk operations.

The key is stored in the OS-provided secure enclave or keychain: Apple Secure Enclave (macOS/iOS), Android Keystore, Windows CNG, or TPM-backed Linux keychains.

### Wallet Declaration

```json
{
  "agent_did": "did:web:agent.mobile.dev",
  "binding_model": "os_keychain",
  "key_type": "P-256",
  "created_at": "2026-03-05T10:00:00Z",
  "rotation_policy": { "max_age_days": 30, "auto_rotate": true },
  "os_keychain_config": {
    "platform": "apple_secure_enclave",
    "biometric_required": true
  }
}
```

### Supported Platforms

| Value | Platform |
|---|---|
| `apple_secure_enclave` | macOS/iOS Secure Enclave |
| `android_keystore` | Android Keystore |
| `windows_cng` | Windows Cryptography API: Next Generation |
| `linux_tpm` | TPM-backed Linux keychain |

### Security Trade-offs

| Advantage | Risk |
|---|---|
| Easy to use — no external dependencies | Physical device access risk |
| Biometric protection (optional) | Platform trust dependency |
| Good for iterative development | Limited to one device |

---

## Delegation Scope (Session Keys)

For agents that operate with **delegated authority** from a master DID, the `delegation_scope` block captures the scope constraints. Sub-agents MUST stay within their declared scope.

```json
{
  "agent_did": "did:web:agent.acme.corp:sub-agent-session",
  "binding_model": "os_keychain",
  "key_type": "Ed25519",
  "created_at": "2026-03-05T10:00:00Z",
  "rotation_policy": { "max_age_days": 1 },
  "delegation_scope": {
    "master_did": "did:web:acme.corp",
    "delegation_credential_id": "urn:uuid:a1b2c3d4-...",
    "permitted_gate_types": ["payment", "credential"],
    "max_payment_amount_usd": 50.00,
    "expires_at": "2026-03-05T18:00:00Z"
  }
}
```

- **`permitted_gate_types`**: Limits what gate types this session key may satisfy
- **`max_payment_amount_usd`**: Hard spending cap enforced by the Operator Spending Policy (G18)
- **`expires_at`**: Session keys should have short TTL (recommended: 8h or less)

The corresponding W3C Verifiable Credential (`delegation_credential_id`) is issued by the master DID and must be presented as a DelegationProof gate proof (G16).

---

## Key Rotation Protocol

All models MUST follow this rotation protocol:

1. **Generate new key pair** in the secure store
2. **Update DID document** — add new verification method, keep old one for grace period (48h)
3. **Publish** updated DID document (via `did:web` = HTTP update to `/.well-known/did.json`)
4. **Notify connected publishers** via `EEP-Agent-DID` header on next request (or session refresh)
5. **Deactivate old key** after grace period

EEP recommends:
- **90-day maximum** key age (operator_derived)
- **365-day maximum** for hardware-isolated (HSM) keys
- **30-day** for OS keychain session keys
- **8h–24h** for delegation scope session keys

---

## Post-Quantum Readiness

Set `"pqc_ready": true` when the wallet is configured for hybrid signing:

```
Signature = EdDSA(payload) || ML-DSA-65(payload)
```

Publishers with PQC-enabled gates will prefer agents that declare `pqc_ready: true`. The `ML-DSA-*` key types are NIST FIPS 204 standardized lattice-based signatures. See SPECIFICATION.md §14 and Whitepaper §11.4.

---

## Schema Reference

Full JSON Schema: [`schemas/v0.1/agent.wallet.json`](../../schemas/v0.1/agent.wallet.json)

TypeScript type: `AgentWallet` — exported from `@eep-dev/gates`

```typescript
import type { AgentWallet, WalletBindingModel } from '@eep-dev/gates';
```
