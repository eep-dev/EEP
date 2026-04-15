# EEP governance model

## Overview

EEP uses an evolving governance model to stay open while enabling fast progress during early development.

Current pre-1.0 core team and research/implementation partners:

- Prof. Dr. Ugur Cekmez (Munich University of Digital Technologies and Applied Sciences, Germany)
- Yigit Yakupoglu (Technic AI, Carnegie Mellon University (MS))
- Jackson Foley (ThriveLogic, ex-Lockheed Martin engineer)
- Omid Jaafari (SudoVision)
- Kasim Acikbas (Ultralytics)
- Tarik Altuncu (PhD, Imperial College)
- Erdem Cimenoglu (Siemens)
- Berk Baytar (Chooch, DevOps expert)
- BeneluxSoft, Belgium (development partner)
- MUDT (research partner)

---

## Phase 0.x: BDFN (benevolent dictator for now)

During the pre-1.0 phase, the EEP core team acts as the technical steward of the specification. We make changes openly via GitHub issues and pull requests, but the final decision belongs to the core team.

Committee governance works well for mature standards but can slow down early-stage specs. The 0.x phase focuses on proving the model.

We welcome community participation:
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md) in all interactions.
- Open GitHub issues for feedback, corrections, and proposals.
- File pull requests against the spec. We will review and merge improvements.
- Join the discussion on [GitHub Discussions](https://github.com/eep-dev/EEP/discussions).

---

## Phase 1.0: Technical steering committee (TSC)

At `v1.0`, EEP governance will transition to a formal technical steering committee (TSC) with:
- 3–7 elected members representing major implementors
- Quarterly specification reviews
- Public RFCs (request for comments) with a 30-day review window
- A formal deprecation policy (18-month notice for breaking changes)

---

## Versioning policy

EEP follows [Semantic Versioning](https://semver.org/) (semver):
- `0.x` — Pre-release. Breaking changes are allowed between minor versions with a 30-day notice.
- `1.x` — Stable. No breaking changes in patch releases. Minor versions add features but must remain additive. Breaking changes require a new major version.
- Platforms must advertise their supported EEP version in all responses via the `EEP-Version` header.

## License

The EEP specification uses the Apache 2.0 license. Implementations are free to be open or proprietary.

---

## EEIP Lifecycle (EEP Improvement Proposals)

EEIPs are the formal mechanism for proposing changes to the EEP specification. All protocol-level changes, new gate types, new event types, and breaking modifications MUST go through the EEIP process.

### Template

Use [`docs/EEIP-TEMPLATE.md`](docs/EEIP-TEMPLATE.md) to start a new proposal.

### EEIP Tracks

| Track | Purpose |
|---|---|
| **Protocol** | Changes to Layer 1 REST, Layer 2 SSE/Webhooks, or Layer 3 WebSocket behavior |
| **Informational** | Architectural guidance, best practices, clarifications (no normative changes) |
| **Process** | Changes to the EEIP process itself or governance |

### EEIP Lifecycle

```
IDEA → Draft → Review → Accepted / Rejected → Final → Deprecated
                          (60-day window)   (2 impls)
```

| Stage | Description | Transition Criteria |
|---|---|---|
| **Draft** | Author submits PR with `EEIP-{n}-{title}.md`. Open for early feedback. | PR opened to `proposals/` directory |
| **Review** | EEIP enters a 60-day public comment window. TSC reviews. | TSC acknowledges as Review-Ready via PR label |
| **Accepted** | TSC votes to accept (majority of TSC members). | TSC vote recorded in PR; EEIP merged |
| **Rejected** | EEIP rejected by TSC with written rationale. | TSC vote + rejection reason posted in PR |
| **Final** | At least 2 independent, interoperable implementations exist and are documented. | Author submits 2 conformance test results |
| **Deprecated** | EEIP superseded by a newer EEIP. | New EEIP references old EEIP as `Deprecates` |

### Pre-1.0 Fast Track

During Phase 0.x (benevolent dictator), the EEIP process is **optional but encouraged**. The core team may accept changes via regular PRs with a shorter review window (14 days). All G1–G23 changes were applied via this fast track.

### Reference

Per Whitepaper §12.1 (Part V: Governance & Roadmap):
> "Protocol changes require a formal EEIP process: Draft → 60-day community review → TSC vote → Final (requiring 2 implementations). The EEIP registry is maintained at [eep.dev/proposals](https://eep.dev/proposals)."


---

## Ecosystem Enforcement: Bad-Actor Response Protocol (G35)

> **Whitepaper §12.2:** When a publisher is found to be abusing the ecosystem (malicious payloads, fraudulent gate requirements, identity misrepresentation, signed agreement violations), EEP's response is layered.

### Three-step bad-actor response

**Step 1 — On-chain DID revocation:**
The compromised or malicious DID is revoked in its authoritative DID registry. All compliant EEP agents MUST check the DID Document before accepting any proof via the `doc.revoked` flag. Any proof signed by a revoked key MUST be rejected even if the cryptographic signature itself verifies correctly.

```
// Agents must check before accepting any proof:
const didDoc = await resolveDID(proof.agent_did);
if (didDoc.revoked || isKeyRevoked(didDoc, proof.signing_key)) {
  rejectProof('DID or signing key has been revoked');
}
```

**Step 2 — eep.dev registry removal:**
The entity's record is removed from the discovery registry and its Trust Anchor credential is revoked. Agents querying the registry will no longer receive the entity in results. This prevents discovery but does not block direct connections.

**Step 3 — `trust.signal.revoked` broadcast:**
The Standards Committee (or TSC in Phase 1.0) publishes a signed `trust.signal.revoked` event to all registered agents that have previously subscribed to the affected entity. Agents receive this signal in real time via their SSE or WebSocket subscription and SHOULD:
- Sever the relationship with the entity.
- Log an audit event with the revocation reason.
- Notify their operator.

```json
{
  "type": "trust.signal.revoked",
  "source": "did:web:eep.dev",
  "data": {
    "target_did": "did:web:malicious-entity.example",
    "reason": "fraudulent_gate_requirements",
    "revocation_timestamp": "2026-03-05T12:00:00Z",
    "committee_signature": "Ed25519:abc123..."
  }
}
```

### Principles

This is not censorship. A bad actor retains the ability to run their servers. What they lose is:
- **Discoverability** (registry removal)
- **Trust credentials** (Trust Anchor VC revocation)
- **Valid proof acceptance** (DID key revocation)

In practice, the ecosystem stops interacting with them automatically, without any human intervention.

---

## Sector-Specific Conformance Extensions (G36)

> **Whitepaper §11.4:** "The EEIP process can be used to propose sector-specific conformance extensions (e.g., `EEP-FinServ-1.0`, `EEP-Health-1.0`) that add additional normative requirements on top of the base protocol."

### What are sector extensions?

Sector-specific conformance extensions are EEIPs of type **Protocol** that define additional normative requirements for a particular industry vertical. They extend a base conformance tier (Core, Standard, or Full) without replacing it.

### Naming convention

```
EEP-{Sector}-{Major}.{Minor}
```

Examples:
- `EEP-FinServ-1.0` — Financial services (DORA, PSD2 requirements)
- `EEP-Health-1.0` — Healthcare (HIPAA, HL7 FHIR alignment)
- `EEP-Legal-1.0` — Legal automation (eIDAS 2.0, eSignature compliance)
- `EEP-IoT-1.0` — Internet of Things (constrained device profiles)

### Requirements for a sector EEIP

A valid sector EEIP MUST:
1. **Declare the base tier it extends** (Core, Standard, or Full).
2. **Define only additive requirements** — sector EEIPs may not relax any base protocol requirement.
3. **Reference the relevant regulatory framework** (regulation name, article, and section).
4. **Define a sector-specific conformance credential type** (e.g., `EEPConformanceCredential_FinServ_1_0`).
5. **Include a sector-specific conformance test suite** extension that runs after the base EEP conformance suite.
6. **Be co-authored or reviewed by a recognized body** in the regulated sector (e.g., a financial standards body for FinServ).

### How to propose a sector extension

Use the standard EEIP process (see EEIP Lifecycle above) with the following additional EEIP template fields:

```markdown
## Sector Extension Metadata
| Field | Value |
|---|---|
| **Base Tier** | Full |
| **Sector** | Financial Services |
| **Regulatory Framework** | EU DORA (Regulation 2022/2554) |
| **Co-Authors** | [Name], [Organization + sector body] |
| **Sector Credential Type** | `EEPConformanceCredential_FinServ_1_0` |
```

See [`docs/EEIP-TEMPLATE.md`](docs/EEIP-TEMPLATE.md) for the full proposal template.
