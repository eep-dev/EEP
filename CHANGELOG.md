# Changelog

All notable changes to this repository are documented here. The format is loosely based on Keep a Changelog.

## Unreleased

### Security

- **`@eep-dev/gates` (TypeScript) and `eep-gates` (Python) — closed a
  default-tier wildcard specificity bypass in `resolveAccess` /
  `resolve_access`.** A gate configuration commonly publishes a broad scope on
  the no-requirements default tier and carves out a narrower, gated path, e.g.
  default `public` with `access: ["content.*", "profile.*"]` plus a `paid` tier
  with `access: ["content.premium.*"]` and `requirements: [...]`. Because
  `content.*` covers `content.premium.X`, the resolver granted access to the
  gated resource through the default tier's broad match even when the gated
  tier's requirements were unmet, so a request with no proofs read premium
  content. The resolver now applies a specificity override: when the winning
  tier is the default tier and a gated (requirements-bearing) tier targets the
  same resource with an **equal-or-more-specific** access pattern, the default
  grant is suppressed and the request is denied with the gated tier's unmet
  requirements (a 402 instead of a leak). A *strictly more specific* default
  pattern keeps its grant (owners can still open a narrower path explicitly),
  resources no gated tier touches stay public, and resources the default tier
  does not cover at all fail closed. New helpers `patternSpecificity`,
  `bestSpecificityFor`, `defaultTierOverriddenByGatedTier` (TypeScript) and
  `pattern_specificity`, `best_specificity_for`,
  `default_tier_overridden_by_gated_tier` (Python) are exported for reuse.
  Resource-less resolution and tiers satisfied by valid proofs are unchanged.
  Surfaced by the EEP protocol audit.

- **`@eep-dev/middleware` (TypeScript) and `eep-middleware` (Python) — auth
  adapters now fail closed and verify credentials.** The `JWTAuthAdapter`
  previously decoded the JWT payload and emitted `did_verified` identity and
  capability proofs **without checking the signature or `alg`**, so any
  attacker-crafted (including `alg: none`) token granted whatever the claims
  asserted. It now rejects `alg: none` unconditionally, verifies HS256/384/512
  signatures against a configured `secret` (constant-time), delegates asymmetric
  algorithms to a `verifyToken` / `verify_token` callback, enforces
  `exp`/`nbf`/`iat` with a configurable clock-skew tolerance, and emits nothing
  (warning once) when no verification material is configured. The TypeScript
  `OAuthAuthAdapter` no longer trusts a client-supplied `X-OAuth-Scope` header;
  it requires an RFC 7662 `introspect` callback and reads scope/subject only from
  the authorization server's response. Surfaced by the EEP protocol audit.

- **`eep-middleware` (Python) — removed a gate bypass and added webhook SSRF
  validation.** `EEPServer.resolve_gated_resource` previously granted premium
  access to any request carrying a hard-coded `{"type":"payment","token":"tok_valid"}`
  proof, ignoring the gate config and any semantic verifier. It now resolves
  access through `eep_gates.resolve_access` with strict semantic verification
  (fails closed; register `proof_verifiers` for real checks), reaching parity
  with the TypeScript `@eep-dev/middleware`. `POST /eep/subscribe` now requires
  a `delivery_url` for webhook subscriptions and validates it with
  `eep_validator.validate_ssrf` before persisting, rejecting callbacks to
  private / loopback / link-local addresses. `eep-gates` and `eep-validator`
  are now declared dependencies. Surfaced by the EEP protocol audit.

## [0.1.0] - 2026-05-19

First public npm publish of all `@eep-dev/*` TypeScript packages at `0.1.0`.

### Added

- **`@eep-dev/middleware` — webhook dispatcher** — New
  `WebhookDispatcher` fans published events out to webhook subscribers
  with the retry policy mandated by
  [docs/current/delivery_guarantees.md](./docs/current/delivery_guarantees.md)
  §2: the 7-attempt exponential-backoff schedule (immediate → +5s →
  +30s → +2m → +15m → +1h → +6h), a 10-second per-attempt timeout, and
  automatic transition to the `paused` state after 5 consecutive
  fully-failed deliveries (reset on the next success). Deliveries are
  signed per Standard Webhooks via `@eep-dev/signer`, re-signed each
  attempt so a late retry still lands inside the subscriber's replay
  window, and filtered by `event_types` via `@eep-dev/validator`.
  - `SubscriptionRecord` gains `event_types`, `status`,
    `failure_count`, and a per-subscription `delivery_secret`;
    `DBAdapter` gains `updateSubscription`. The in-memory and Postgres
    adapters implement it, and the Postgres adapter tolerates rows
    written before the new columns existed.
  - `EEPServer` now persists those fields on `/eep/subscribe` and mints
    a `delivery_secret` returned once in the creation response;
    `/eep/audit-log` redacts `delivery_secret` so it is never
    re-exposed.
  - `@eep-dev/signer` and `@eep-dev/validator` added as `middleware`
    dependencies and to its build chain.
- **`@eep-dev/signer/web`** — Fixed a build break against
  `@types/node` ≥ 25: `SubtleCrypto.verify` now narrows its data
  argument to `BufferSource`, so the base64-decoded signature is cast
  accordingly.

- **Open-source readiness audit** — Comprehensive trust-bundle and
  release-pipeline hardening pass to prepare the repo for public
  Apache-2.0 launch:
  - **NOTICE** — Apache 2.0 §4(d) attribution file added at the repo
    root, listing pydantic, FastAPI, httpx, and informatively
    referenced standards (CloudEvents, DID, VC, Standard Webhooks,
    SSE, RFC 6455, RFC 2119, etc.).
  - **GOVERNANCE.md § Intellectual Property, Trademark &
    Independence** — explicit statement of inbound=outbound licensing,
    DCO, patent grant, trademark posture, domain/org ownership, and
    independence from any commercial sponsor; conflict-of-interest
    rules; legal contact.
  - **MAINTAINERS.md** (new), **`.github/CODEOWNERS`** (new),
    **ROADMAP.md** (new), **CITATION.cff** (new).
  - **SECURITY.md** — coordinated-disclosure timeline, encrypted
    reporting (PGP + sigstore), security model summary, external
    audit roadmap, link to the new MCP-Bridge threat model.
  - **`packages/@eep-dev/mcp-bridge/SECURITY.md`** (new) — full
    threat model for the MCP↔EEP trust boundary (T1 prompt-injection,
    T3 SSRF, T4 replay, T6 LLM-DoS, etc.) with operator checklist.
  - **Release pipeline (`.github/workflows/publish.yml`)** — every
    `npm publish` now uses `--provenance` (SLSA build attestation);
    every PyPI upload uses Trusted Publishing OIDC (no token); all
    publish jobs sit behind a manual-approval `release` GitHub
    environment; CycloneDX SBOM emitted as a release artifact;
    sigstore/cosign keyless signatures on every release artifact;
    whitepaper PDF and conformance-fixtures tarball attached to
    GitHub Releases; `setup-cli`, `agent-adopt`, `middleware`, and
    `eep-middleware-python` now included in the publish workflow.
  - **`.github/renovate.json`** (new) — pins every GitHub Action to a
    commit SHA on a weekly cadence.
  - **Repo metadata** — every `@eep-dev/*` `package.json` and every
    `eep-*-python` `pyproject.toml` now declares `repository`,
    `bugs`, `homepage`, classifiers, project URLs, consistent
    `engines.node ≥ 20` (`>= 22` for `compliance-cli`),
    `requires-python ≥ 3.11`, a `files` whitelist, and
    `publishConfig.provenance: true`. `py.typed` marker added to
    every Python package.
  - **`pnpm-workspace.yaml`** + root `package.json` + `tsconfig.base.json`
    — single-command monorepo build groundwork.
  - **`@eep-dev/signer/web`** — new WebCrypto-based async signer
    subpath for Cloudflare Workers, Deno Deploy, browsers, and Bun;
    parity-tested against the Node `EEPSigner`.
  - **`tests/conformance-fixtures/`** (new) — 15 offline test
    vectors across discovery, envelope, signature, gates, and
    subscription with a machine-readable `manifest.json`. Both the
    TypeScript schema test suite and a new pytest suite
    (`tests/cross-impl/test_conformance_fixtures.py`) consume them
    in lockstep so any fixture or implementation drift fails CI. The
    fixtures are released as a versioned tarball on every GitHub
    Release.
  - **`scripts/codegen-schema-types.mjs`** (new) — generates a
    TypeScript surface from the JSON Schemas; CI's `--check` mode
    fails the build if the schemas and the generated types drift.
  - **`docs/standards/draft-eep-protocol-core-00.md`** — IETF
    Internet-Draft (kramdown-rfc front matter) for the Core tier,
    ready for IETF datatracker submission.
  - **`.github/ISSUE_TEMPLATE/reference-implementation-rfc.yml`**
    (new) — structured intake template for organisations proposing a
    new-language reference implementation.
  - **`@eep-dev/agent-adopt`** — first vitest test suite (mocked
    `@eep-dev/setup-cli`), exercising happy-path orchestration,
    early exits on inject/apply/verify failure, `--no-patch`,
    `--help`, `--report`, and the optional compliance step.
  - **README** — promoted "Why EEP, not just MCP / A2A / webhooks /
    ActivityPub?" to a prominent block above the existing
    positioning table.
  - **CONTRIBUTING.md** — DCO sign-off, conformance-fixture, and
    schema-types drift gate sections added.

- **Spec §14.2 (Standard checklist)** — Clarified that webhook HMAC for outbound deliveries uses **Standard Webhooks** header names (`webhook-signature`, etc., per §5), consistent with the compliance runner and the rest of the normative text.
- **`@eep-dev/agent-adopt`** — New package: chains `setup-cli` inject/apply/verify, optional Express/FastAPI patchers, optional live `compliance-cli`, writes `EEP_ADOPTION_REPORT.md`. See [AGENTS.md](./AGENTS.md).
- **`@eep-dev/setup-cli`** — Exports `runInject`, `runApply`, `runVerify`, `applyFrameworkPatchers`; adds `src/inject/patchers/` (Express/FastAPI best-effort). **Fix:** `eep-setup` side-effect entry only when the **resolved** main script matches this package (avoids hijacking `index.js` when imported by `agent-adopt`).
- **Docs** — [docs/strategy/](./docs/strategy/) (adoption strategy, unmet-needs map, launch playbook, registry seed, distribution checklist, screencast runbook). **Registry:** [registry/adopters.json](./registry/adopters.json). **Badge:** [assets/badges/eep-compatible.svg](./assets/badges/eep-compatible.svg).
- **Integrations** — Thin harness docs: [integrations/openclaw-bundle/](./integrations/openclaw-bundle/), [integrations/cursor-rule/](./integrations/cursor-rule/), [integrations/claude-code-skill/](./integrations/claude-code-skill/).

## v0.1 (tooling and examples — 2026-04-15)

- **Interactive playground** — browser-based EEP event validator and webhook signer at `eep-site/app/playground/` (Web Crypto HMAC-SHA256, client-side schema validation against `event.envelope.json`).
- **Compliance-CLI HTML report** — `--report-html` flag generates a self-contained HTML audit report alongside JSON and Markdown. New probes: Layer 1 content negotiation (JSON/Markdown), 402 payment gate, WebSocket pulse check, and wired CloudEvents/EEP helper validators.
- **LangGraph/Claude integration example** — `examples/langgraph-eep-agent/` demonstrates a LangGraph agent subscribing to EEP events with gate handling (402/403), HMAC verification, and Claude-powered event summarization. Guide: `docs/guides/langgraph-eep-agent.md`.
- **OpenAPI Layer 1 enrichment** — `buildOpenAPI` in `@eep-dev/setup-cli` now emits full Layer 1/2/3 paths with schema `$ref`s (eep-manifest, gate.402/403, subscription.request), Accept content negotiation parameters, EEP response headers, server block, license, and tags.

## v0.1 (normative additions — 2026-04)

Backward-compatible **v0.1** extensions (schemas, docs, and reference behavior) include:

- **Federation registry economics** — optional `economics` metadata on `eep-registry` manifests (registration fee, query quota, staking/challenge policy).
- **M2M commerce disputes** — WebSocket `commerce.dispute.*` message family (see `schemas/v0.1/ws-message.json`).
- **Delegation privacy propagation** — `delegation.proof` credential subject may bind `operator_privacy_policy_hash`, `allowed_dpv_purposes`, and `max_retention_days`; gates enforce alignment with `data_request` requirements.
- **Cold-start trust** — reference APIs demonstrate `cold_start` → `standard` progression (`POST /eep/trust/graduate`, `GET /eep/trust-status`, `X-EEP-Trust-State`).
- **Combined gates** — `gate.config` supports `combined` requirements; access resolution considers only tiers whose **access list** matches the requested resource (avoids subset-proof tiers masking combined tiers).
- **Docs (whitepaper + normative spec)** — clarified semantic alignment for commerce/data exchange (JSON-LD contexts / declared profiles), high-frequency settlement options alongside L1 confirmations, Layer~3 replay retention bounds (`pulse_replay_*`, close code `4009`), DID resolver caching with fail-closed guidance, and IoT/PQ payload trade-offs.
- **Docs (whitepaper GEO context)** — informative GEO / generative-retrieval framing (manifest vs sitemap, agreement-gate attribution as policy text, publisher use case); bibliography `ref33`–`ref35`; **normative spec** adds non-normative notes in Abstract, §3.4.2 (`agreement`), and §12 Discovery so GEO remains documentation motivation, not a conformance requirement.

**Adopters:** pin package versions; run `@eep-dev/compliance-cli` with `--report-json` / `--report-md` after upgrades. Python package name on PyPI-style installs: `eep-gates` (source tree: `packages/eep-gates-python/`).
