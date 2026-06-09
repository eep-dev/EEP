# EEP governance model

## Overview

EEP uses an evolving governance model to stay open while enabling fast progress during early development.

Current pre-1.0 core team and research/implementation partners:

- Dr. Ugur Cekmez (Professor, Munich University of Digital Technologies and Applied Sciences)
- Yigit Yakupoglu (Technic AI, Carnegie Mellon University (MS))
- Jackson Foley (ThriveLogic)
- Omid Jaafari (SudoVision)
- Enes Demirag (Klyft)
- Kasim Acikbas (Ultralytics)
- Dr. Tarik Altuncu (PhD, Imperial College)
- Erdem Cimenoglu (Siemens)
- Berk Baytar (Chooch)
- BeneluxSoft, Belgium (development partner)
- MUDT (research partner)
- Biruni University (research partner)

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

## Intellectual property, trademark, and independence

EEP is intended to be neutral, vendor-independent infrastructure for the
agentic web. This section makes the operational reality of that intent
explicit so that implementors, contributors, sponsors, and downstream
consumers can review the project's IP posture before adopting it.

### Inbound = outbound (Apache 2.0)

Every contribution accepted into this repository is licensed under the same
Apache 2.0 terms that cover the project itself (see [LICENSE](./LICENSE)).
Contributors retain copyright in their contributions; the project does not
require a Contributor License Agreement (CLA) at this time.

### Developer Certificate of Origin (DCO)

All commits to `main` MUST carry a `Signed-off-by:` trailer, matching the
[Developer Certificate of Origin v1.1](https://developercertificate.org/).
This is enforced by CI; use `git commit -s` to add the trailer
automatically. The DCO is a lightweight per-commit assertion that the
contributor has the right to submit the work under the project's license,
and is the recommended alternative to a CLA for foundation-aligned
projects.

### Patents

The Apache 2.0 license includes an explicit patent grant from contributors
(§3 of the license). By submitting a contribution, a contributor grants the
project and its downstream users a perpetual, worldwide, non-exclusive,
royalty-free patent license covering that contribution, on the terms set
out in the license.

### Trademark

"EEP" and "Entity Engagement Protocol" are project names used by the
community to identify the specification and its conforming implementations.
The project does not currently assert a registered trademark, and does not
restrict factual or nominative uses (e.g. "this library implements EEP",
"EEP-compatible"). Implementations and products MUST NOT use the name in a
way that suggests endorsement, affiliation, or certification by the EEP
project unless they have passed the relevant conformance tier
([TESTING.md](./TESTING.md)) and obtained a corresponding conformance
credential.

If, in a future phase, the project elects to register a trademark, the
intention is to do so under a foundation or other neutral steward, with a
public usage policy aligned with the
[Linux Foundation Trademark Usage Guidelines](https://www.linuxfoundation.org/legal/trademark-usage)
or the
[Apache Software Foundation trademark policy](https://www.apache.org/foundation/marks/),
not under any individual contributor or commercial entity.

### Domains and accounts

The following project assets are operated by the core team listed at the
top of this document. Any change of steward will be announced in this
section before it takes effect:

- `eep.dev` — primary domain, currently operated by the EEP core team
- `https://github.com/eep-dev` — the GitHub organization that hosts
  `EEP` and `eep-site`
- `hello@eep.dev` — security and general contact mailbox

The intent is for these assets to be transferred to a neutral foundation
(or equivalent steward) on or before the v1.0 transition, in conjunction
with the formation of the Technical Steering Committee (see
[ROADMAP.md](./ROADMAP.md)).

### Independence from any commercial sponsor

Several core-team members are affiliated with academic institutions,
research partners, or commercial entities (notably MUDT and BeneluxSoft).
EEP itself originated as engineering work at more.md and was open-sourced
for the community under Apache 2.0; more.md continues to maintain the
specification alongside the rest of the core team and operates the
production reference implementation. Other companies and academic
partners also adopt EEP and contribute back to the spec. The origin
relationship is structural and is disclosed openly here so that
contributors, sponsors, and downstream consumers can evaluate it. To
prevent any single sponsor — including more.md — from steering the
specification:

1. **No commercial entity has a controlling vote** over the spec, schemas,
   or conformance test suite. Decisions follow the EEIP lifecycle and the
   governance phase in force (BDFN until v1.0; TSC majority thereafter).
2. **Spec changes that primarily benefit a single product** require an
   EEIP with the standard 60-day public review and at least one independent
   implementation before reaching `Final`.
3. **Conformance test ownership** lives in this repository and follows
   the same governance as the specification. Conformance credentials
   (`EEPConformanceCredential_*`) MUST be issued from project-controlled
   keys, not from sponsor-controlled keys.
4. **Funding and infrastructure sponsorship** disclosures (CI minutes,
   hosting, audit costs) will be published in this section once the
   project formally accepts external funding.

If a contributor or maintainer becomes aware of a conflict between a
commercial sponsor's product roadmap and the integrity of the spec, they
SHOULD raise it on the `governance` issue label. The core team commits to
publishing a written response within 14 days.

### Conflict of interest

Maintainers and TSC members MUST disclose, in their public profile or in
[MAINTAINERS.md](./MAINTAINERS.md):

- Their primary employer.
- Any commercial product they own or maintain that depends on, or
  competes with, EEP.
- Any compensation received from a sponsor in connection with their
  EEP work.

When a maintainer has a conflict on a specific decision (e.g. an EEIP that
materially affects their employer's product), they MUST recuse themselves
from the vote and note the recusal in the PR.

### Legal contact

Legal questions about this section, the trademark, or any reuse of the EEP
name should be sent to `hello@eep.dev` with `[Legal]` in the subject. The
core team will route the question to the appropriate contributor or, where
necessary, decline to comment until the v1.0 foundation transition.

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
| **Draft** | Author submits PR with `EEIP-{n}-{title}.md`. Open for early feedback. | PR opened to the `docs/eeips/` directory |
| **Review** | EEIP enters a 60-day public comment window. TSC reviews. | TSC acknowledges as Review-Ready via PR label |
| **Accepted** | TSC votes to accept (≥2/3 majority of TSC members). | TSC vote recorded in PR; EEIP merged |
| **Rejected** | EEIP rejected by TSC with written rationale. | TSC vote + rejection reason posted in PR |
| **Final** | At least 2 independent, interoperable implementations exist and are documented. | Author submits 2 conformance test results |
| **Deprecated** | EEIP superseded by a newer EEIP. | New EEIP references old EEIP as `Deprecates` |

> **Decision body and submission directory.** During the `0.x` benevolent-dictator phase the **core team** acts as the EEIP decision body; from `v1.0` this role transfers to the elected **TSC**. Some earlier documents (e.g. `docs/eeips/EEIP-0001-core-base.md`) refer to this body as the *Standards Committee* — these names denote the same role. All EEIPs are submitted to the **`docs/eeips/`** directory (there is no `proposals/` directory); `eep.dev/proposals` is the public web mirror of that directory.

### Pre-1.0 Fast Track

During Phase 0.x (benevolent dictator), the EEIP process is **optional but encouraged**. The core team may accept changes via regular PRs with a shorter review window (14 days) instead of the 60-day formal window. All G1–G23 changes were applied via this fast track.

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
