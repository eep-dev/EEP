# EEP Standards Track Readiness (IETF + W3C)

## Goal

Establish EEP as a protocol with standards-body legitimacy while preserving protocol-first positioning and compatibility with MCP/A2A/ANP composition patterns.

## 1) IETF Track (primary for wire/protocol specs)

### 1.1 Recommended path

1. Publish `draft-eep-protocol-core-00` as an Internet-Draft.
2. Socialize in relevant lists/BoFs (`dispatch`, `httpapi`, `webpush` depending on scope split).
3. Decide stream:
   - Independent stream first (fastest), then WG adoption, or
   - direct WG adoption if sponsor support is strong.
4. Iterate draft versions (`-01`, `-02`, ...) from review feedback.
5. Target RFC status:
   - Proposed Standard for core protocol behavior
   - BCP companion for deployment hardening profiles.

### 1.2 Draft split recommendation

- `draft-eep-core`: discovery, entity resolution, subscription semantics, event model.
- `draft-eep-gates-commerce`: 402/x402 semantics, proof classes, fail-closed requirements.
- `draft-eep-security`: threat model, replay protection, webhook signing, transport profile.

**Informative docs vs wire specs:** Narrative on *generative engine optimization* (GEO), sitemaps, and publisher retrieval strategy lives in [`docs/WHITEPAPER.tex`](../WHITEPAPER.tex) and related guides. Internet-Drafts should stay normative on wire formats and verification; cite the whitepaper only where helpful for motivation, not as a protocol requirement.

## 2) W3C Track (identity/credentials/profile alignment)

Use W3C for DID/VC/profile bindings, not transport wire format:

- DID profile for EEP actor/entity identifiers.
- VC profile for delegation and gate credentials.
- Conformance test vectors aligned with W3C test-suite style.

## 3) Evidence package required before submission

- Stable machine-readable schemas (already present under `schemas/`).
- Interop evidence:
  - Node and Python bridge parity fixtures
  - Node and Python reference API parity fixtures
- Security evidence:
  - redteam/pentest tests for bridge input hardening
  - fail-closed gate defaults and proofs
- Operational evidence:
  - deployment runbooks and incident process.

## 4) Current readiness score (standards lens)

| Area | Score / 10 | Notes |
|---|---:|---|
| Core technical spec maturity | 8 | Detailed spec set, but draft split and formal language pass still needed |
| Security model maturity | 8 | Strong controls and tests; needs external review rounds |
| Interop evidence | 8 | Multi-runtime references + parity fixtures now exist |
| Ecosystem/governance readiness | 7 | Governance is clearer, but external adopter references still limited |
| Standards editorial readiness | 7 | Needs Internet-Draft authoring style pass and RFC2119 keyword consistency audit |

## 5) 90-day execution roadmap

### Days 0-30

- Freeze protocol terminology and RFC2119 keyword pass.
- Produce `-00` Internet-Draft text from `docs/current/SPECIFICATION.md`.
- Build standards companion test index (`tests/interop-index.md`).

### Days 31-60

- Run two public interop pilots (external implementers).
- Collect implementation reports and unresolved ambiguity list.
- Submit revised `-01` draft with ambiguity fixes.

### Days 61-90

- Formalize WG/stream strategy and chairs/sponsor outreach.
- Publish security considerations appendix with deployment profiles.
- Prepare W3C DID/VC profile note for parallel publication.

## 6) Blocking risks

- Protocol scope creep into adjacent standards instead of composition.
- Ambiguous normative language across docs.
- Insufficient external implementation diversity.

## 7) Mitigations

- Maintain protocol positioning matrix as a normative non-goal guardrail.
- Run automated wording audit for MUST/SHOULD/MAY consistency per release.
- Require at least 2 independent implementations before each draft milestone.
