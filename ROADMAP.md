# EEP roadmap

This roadmap is a *plan of intent*, not a contract. Items shift based on
implementer feedback, EEIPs in flight, and community capacity. The most
recent state of the milestones lives here; closed/merged work moves into
[CHANGELOG.md](./CHANGELOG.md). Quarter labels are calendar quarters.

> **Stability:** EEP is currently `v0.1`. Breaking changes are allowed
> between minor versions during 0.x with a 30-day notice
> ([GOVERNANCE.md § Versioning policy](./GOVERNANCE.md#versioning-policy)).

---

## Now (v0.1.x maintenance — Q2 2026)

Stabilization, hardening, and ecosystem unblocking. Drives toward the
"trust bundle" required for serious enterprise evaluation.

- [x] Apache 2.0 `LICENSE` and `NOTICE` (third-party attribution)
- [x] Governance: IP/trademark/independence section in
      [GOVERNANCE.md](./GOVERNANCE.md)
- [x] `MAINTAINERS.md`, `.github/CODEOWNERS`, `CITATION.cff`, this
      `ROADMAP.md`
- [x] Release pipeline hardening: npm provenance, PyPI Trusted Publishing
      (OIDC), `release` environment with required reviewers, CycloneDX
      SBOM, sigstore/cosign keyless signing, GitHub Action SHA pinning
      via Renovate
- [x] DCO enforcement on every commit to `main`
- [x] **Offline conformance fixtures** under `tests/conformance-fixtures/`,
      consumable by `npx @eep-dev/compliance-cli --fixtures <dir>` without
      booting a live publisher. The vectors and the release tarball existed
      before; the CLI flag that made them runnable by anyone outside this
      repo did not.
- [ ] **Python feature parity**: `eep-gates` (proof verifier, commerce,
      service listing), `eep-middleware` (Flask/FastAPI/Django adapters)
- [ ] `py.typed` markers on every Python package; `mypy --strict` clean
- [ ] `@eep-dev/agent-adopt` end-to-end integration test
- [ ] Aggregated coverage reporting (codecov badge in README); 80%
      minimum gate
- [ ] MCP-Bridge threat model document
      (`packages/@eep-dev/mcp-bridge/SECURITY.md`)

## Next (v0.2 — Q3 2026)

Quality of life and adoption surface area.

- [x] **Monorepo migration to pnpm workspaces** with shared
      `tsconfig.base.json` and a single `pnpm -r test` entry point —
      `pnpm-workspace.yaml`, `tsconfig.base.json` and the root
      `packageManager: pnpm@9.15.0` all landed. What remains is narrower and
      tracked separately below.
- [ ] **Consolidate to a single `pnpm-lock.yaml`.** Per-package
      `package-lock.json` files still coexist with the pnpm workspace because
      CI invokes per-package `npm ci`; moving CI to `pnpm -r install` removes
      N redundant dependency resolutions per run.
- [ ] **Schema → TypeScript / Pydantic codegen** with a CI drift gate
      (no hand-maintained types diverging from `schemas/v0.1/*.json`)
- [ ] WebCrypto shim in `@eep-dev/signer` for edge runtimes
      (Cloudflare Workers, Deno Deploy, browsers)
- [ ] ReDoS fuzzing on user-supplied gate-config patterns
- [ ] **First external security audit engagement** (OSTIF / Trail of
      Bits / NCC / Doyensec scope: HMAC, SSRF, gate proofs, MCP-bridge,
      replay/nonce stores, agent-adopt subprocess invocation)
- [ ] Spec polishing pass:
  - tighten "Core" tier to be free/no-payment by default
  - explicit comparison vs ActivityPub
  - schema $id versioning + spec-section anchors
- [ ] Internet-Draft (IETF) or W3C Community Group submission of the
      Core protocol (`docs/standards/draft-eep-core-00.md`)
- [ ] At least 3 EEIPs progressed to **Review**

## Later (v0.3 — Q4 2026)

Pre-1.0 polish; second-implementer outreach in earnest.

- [ ] **Second-language reference implementations** (Go and/or Rust) by
      external maintainers, passing Core conformance fixtures
- [ ] **Foundation transfer plan** for `eep.dev`, the GitHub org, and any
      registered marks — published, with target steward identified
- [ ] Conformance credential issuance pipeline (project-controlled key,
      transparent log, revocation flow)
- [ ] Sector-extension bootstrap: at least one sector EEIP draft
      (FinServ, Health, Legal, or IoT) in **Review**
- [ ] First public adopter list with verified conformance reports
      (`registry/adopters.json` populated by ≥3 unaffiliated
      organizations)

## v1.0 (target Q1–Q2 2027)

The transition from "Benevolent Dictator For Now" to a Technical Steering
Committee. After v1.0, breaking changes require a major-version bump and
follow the 18-month deprecation notice rule.

- [ ] **TSC formed** (3–7 elected members representing major
      implementors), per
      [GOVERNANCE.md § Phase 1.0](./GOVERNANCE.md#phase-10-technical-steering-committee-tsc)
- [ ] **Foundation transition complete** (or explicit decision to remain
      independent, with the IP & trademark posture documented in
      GOVERNANCE.md)
- [ ] Quarterly spec reviews on the calendar; 30-day public RFC window
      enforced for all protocol-level changes
- [ ] Spec frozen as `v1.0`; all schemas locked at a `$id` that never
      changes
- [ ] External security audit report published, all P0/P1 findings
      remediated, public acknowledgment in [SECURITY.md](./SECURITY.md)
- [ ] **≥2 independent, interoperable implementations** of the Full tier,
      each with a passing conformance credential
- [ ] Registry governance: documented process for adding registered
      entity types, gate types, and methods
- [ ] First **EEIP-FinServ** or equivalent sector extension in **Final**

---

## Out of scope (intentionally not on this roadmap)

EEP intends to *compose with*, not replace, the following ecosystems.
Items in this list are areas where the project will not invest specific
roadmap effort, and instead defers to the named external standard:

- **Tool-call protocol for LLMs** — defers to **MCP** (Anthropic). EEP
  bridges to MCP via `@eep-dev/mcp-bridge`.
- **Agent-to-agent collaboration** — defers to **A2A** (Google).
- **Decentralized agent networking** — defers to **ANP**.
- **Identity & credentials** — defers to W3C **DID** and **Verifiable
  Credentials** Data Model.
- **Event envelope** — defers to **CloudEvents** v1.0.2 (CNCF).
- **Webhook signature convention** — defers to **Standard Webhooks**.
- **Social federation between accounts** — defers to **ActivityPub**.

---

## Keeping this file honest

A roadmap that drifts from the tree is worse than no roadmap: it hides
finished work and misrepresents what is left. Two entries had drifted in
opposite directions — the pnpm migration had shipped while listed as pending,
and the offline fixtures read as unstarted when only a CLI flag was missing.

When updating an item, check the tree rather than memory:

- "Done" needs a file, a command, or a CI job that demonstrates it.
- "Not done" needs a check that it is genuinely absent — a partially shipped
  item should be split so the remaining work is visible on its own.

## How this roadmap is updated

- Items move from **Now** → **Next** → **Later** → **v1.0** → done
  through PRs that update both this file and `CHANGELOG.md`.
- Every quarterly spec review (post-v1.0) ends with a roadmap PR.
- Suggestions are welcome via GitHub Discussions or an issue tagged
  `roadmap`.
