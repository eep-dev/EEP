# Testing Guide — EEP (Entity Engagement Protocol)

## Quick start (all languages)

```bash
bash scripts/bootstrap.sh
bash test.sh
```

This runs schema validation tests and package test suites (core TS/Python packages and `tests/cross-impl` against `http://localhost:3002`; start **`examples/node-gate-publisher`** first or cross-impl fails).

**Not in `test.sh` (run separately or rely on CI):** `packages/@eep-dev/middleware`, `packages/@eep-dev/mcp-bridge`, `packages/@eep-dev/setup-cli`, `packages/@eep-dev/agent-adopt` (no separate test suite yet; depends on `setup-cli`), `packages/eep-middleware-python`, `packages/eep-mcp-bridge-python`. GitHub Actions runs these in [.github/workflows/test.yml](.github/workflows/test.yml). Locally:

```bash
(cd packages/@eep-dev/middleware && npm install && npm test)
(cd packages/@eep-dev/mcp-bridge && npm install && npm test)
(cd packages/@eep-dev/setup-cli && npm install && npm test)
(cd packages/@eep-dev/agent-adopt && npm install && npm run build)
(cd packages/eep-middleware-python && PYTHONPATH=. python3 -m pytest tests/ -q)
(cd packages/eep-mcp-bridge-python && PYTHONPATH=. python3 -m pytest tests/ -q)
```

## Test suites

### Schema validation & benchmarks (`tests/`)

Validates JSON Schemas in `schemas/v0.1/` using Ajv:

- **test_schemas.test.ts** — Tests covering valid payloads, invalid payloads (missing fields, wrong types, boundary values), conditional logic (webhook requires `delivery_url`), and cross-schema consistency.
- **bench.test.ts** — Performance benchmarks validating 10,000 payloads per schema, plus mixed-traffic and invalid-payload rejection benchmarks.

```bash
cd tests && npx vitest run
```

### Individual package tests

```bash
cd packages/@eep-dev/validator && npx vitest run --coverage
cd packages/@eep-dev/signer && npx vitest run --coverage
cd packages/@eep-dev/gates && npx vitest run --coverage
cd packages/@eep-dev/compliance-cli && npx vitest run --coverage
cd packages/@eep-dev/discovery && npx vitest run --coverage
```

### @eep-dev/gates test categories

The gates package has five test files:

| File | What it tests |
|------|---------------|
| `index.test.ts` | Config parsing, resource matching, access resolution, 402 builder, ProofVerifier |
| `commerce.test.ts` | Negotiation state machine transitions, pricing validation, envelope validation |
| `service-listing.test.ts` | Service listing, catalog, and review validation |
| `security.test.ts` | Tier escalation, proof replay, config manipulation, allowlist abuse, resource injection |
| `bench.test.ts` | Throughput benchmarks for matching, parsing, and resolution |

### Python package tests

Each TypeScript package has a corresponding Python port with its own test suite:

```bash
cd packages/eep-signer-python && PYTHONPATH=. python3 -m pytest tests/ -v
cd packages/eep-validator-python && PYTHONPATH=. python3 -m pytest tests/ -v
cd packages/eep-gates-python && PYTHONPATH=. python3 -m pytest tests/ -v
cd packages/eep-compliance-cli-python && PYTHONPATH=. python3 -m pytest tests/ -v
cd packages/eep-discovery-python && PYTHONPATH=. python3 -m pytest tests/ -v
```

### Cross-implementation test suite (`tests/cross-impl/`)

Language-agnostic interoperability tests verifying protocol behavior against any EEP publisher implementation:

```bash
cd tests/cross-impl
pip install -r requirements.txt
EEP_BASE_URL=http://localhost:3002 pytest -v
```

Covers: gate config endpoint, gated resource 402 flow, gated subscription behavior, service catalog shape, discovery schema checks, and SSE stream behavior.

## EEP Conformance Levels (Whitepaper §10.2)

EEP defines 3 conformance tiers, each associated with a distinct `EEPConformanceCredential` VC:

| Tier | Credential Type | Scope |
|---|---|---|
| **Core** | `EEPConformanceCredential_Core` | Layer 1 REST + Layer 2 SSE. Read-only publishers, IoT sensors, knowledge bases |
| **Standard** | `EEPConformanceCredential_Standard` | Core + Webhooks + gate types + version negotiation. B2B APIs, financial feeds |
| **Full** | `EEPConformanceCredential_Full` | Standard + Layer 3 WS + commerce + audit log + PoI. Agent commerce platforms, regulated industries |

### Testing against a conformance tier

```bash
# Run the compliance CLI against a live publisher
npx @eep-dev/compliance-cli \
  --target https://api.yourplatform.com \
  --api-key sk_... \
  --entity u/acme-corp \
  --level full
```

**Conformance checklist summary** (see `SPECIFICATION.md §14` for full detail):

| Tier | Key requirements |
|---|---|
| Core | `/.well-known/eep.json`, SSE stream, `Last-Event-ID` replay, CloudEvents envelope, rate-limit headers |
| Standard | All Core + WebSub intent verification, HMAC webhook delivery, credential/payment/identity gates, 402/403/451 responses, `signing_algorithms` field |
| Full | All Standard + WebSocket, commerce state machine, Proof-of-Intent, DPV data gates, service listings, delivery audit log API |

### Manifest field verification

```bash
# Validate all schemas parse correctly
for f in schemas/v0.1/*.json; do
  python3 -c "import json; json.load(open('$f')); print('OK: $f')"
done
# All schemas in schemas/v0.1 should pass (currently 24 files).
```
