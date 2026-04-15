# Changelog

All notable changes to this repository are documented here. The format is loosely based on Keep a Changelog.

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
