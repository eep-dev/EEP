# @eep-dev/compliance-cli

> **End-to-end conformance testing CLI for any EEP-compatible platform.**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../../docs/current/SPECIFICATION.md)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-green)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../../LICENSE)

---

## Overview

`@eep-dev/compliance-cli` is a zero-dependency test harness that verifies whether a platform correctly implements the Entity Engagement Protocol. It simulates an agent subscriber — creating subscriptions, receiving webhook deliveries, and validating every aspect of the EEP specification.

### What It Tests

The CLI runs tests across **three conformance levels**:

| Level | Tests | What's Verified |
|-------|-------|----------------|
| 🥉 **Core** | Platform reachability, EEP discovery (Link headers), subscription creation, WebSub intent verification, webhook delivery, Standard Webhooks headers, HMAC-SHA256 signature, **timestamp freshness (§5.3)**, CloudEvents envelope **schema-validated** | Signal stream basics |
| 🥈 **Standard** | All Core tests + SSE stream endpoint, **SSE heartbeat (§4.4)**, **`Last-Event-ID` replay (§4.3)**, rate limit headers | SSE + rate limiting |
| 🏆 **Full** | All Standard tests + manifest/policy probes + extended probes (Layer 1 content negotiation, 402 payment gate, WebSocket pulse, CloudEvents/EEP helper validation) | Advanced baseline checks (partial full-tier automation) |

### Offline mode (`--fixtures`)

Every EEP release ships `eep-conformance-vectors-vX.Y.Z.tar.gz`: bytes-on-the-wire
test vectors for discovery documents, event envelopes, signatures, gate responses
and subscription requests. `--fixtures` replays them with **no publisher, no
network and no API key**, so you can check a new implementation before you have
anything deployed:

```bash
tar xzf eep-conformance-vectors-v0.1.0.tar.gz
npx @eep-dev/compliance-cli --fixtures ./conformance-fixtures
```

Both modes write the same `--report-json` / `--report-md` / `--report-html`
artifacts and use the same exit codes.

### JSON Schema validation

Both modes validate documents against the normative schemas in `schemas/v0.1/`,
which are bundled into the published package at build time. Live manifests are
checked against `eep-manifest.json` in full and delivered events against
`event.envelope.json`, rather than spot-checking a handful of attribute names.
If the schemas cannot be located, the affected probes **skip with a stated
reason** — an unvalidated run never reports as a clean one.

> `--level full` currently performs **partial** full-tier automation. WebSocket commerce state machine, PoI cryptographic verification, and some sector-specific checks still require manual/stack-specific validation.

---

## Requirements

- **Node.js ≥ 22** (uses `node:util/parseArgs` and `--experimental-strip-types`)
- **Network access** to the target platform
- **An API key** for authenticated endpoints
- A **publicly reachable port** for the webhook receiver (or use `host.docker.internal` for Docker environments)

---

## Usage

### Quick Start

```bash
# Run against any EEP-compatible platform
npx @eep-dev/compliance-cli --target https://api.example.com --api-key sk_... --entity u/acme-corp

# Test only core conformance
npx @eep-dev/compliance-cli --target https://api.example.com --api-key sk_... --entity u/test --level core

# Use a custom port for the local webhook receiver
npx @eep-dev/compliance-cli --target https://localhost:3000 --api-key sk_... --entity u/test --port 9999

# Emit structured audit reports
npx @eep-dev/compliance-cli \
  --target https://api.example.com \
  --api-key sk_... \
  --entity u/acme-corp \
  --level full \
  --report-json ./eep-audit-report.json \
  --report-md ./eep-audit-report.md \
  --report-html ./eep-audit-report.html
```

### From the Monorepo

```bash
cd packages/@eep-dev/compliance-cli
node --experimental-strip-types src/index.ts \
  --target https://api.example.com \
  --api-key sk_... \
  --entity u/test
```

---

## CLI Options

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--target` | `-t` | `string` | — | Platform base URL. Required unless `--fixtures` is used. |
| `--api-key` | `-k` | `string` | — | API key for authenticated requests |
| `--entity` | `-e` | `string` | — | Entity DID or `{prefix}/{username}` to subscribe to |
| `--level` | `-l` | `string` | `standard` | Conformance level: `core`, `standard`, `full` |
| `--port` | `-p` | `string` | `9876` | Local port for the test webhook receiver |
| `--report-json` | — | `string` | — | Write machine-readable audit report JSON |
| `--report-md` | — | `string` | — | Write human-readable audit report markdown |
| `--report-html` | — | `string` | — | Write self-contained HTML audit report |
| `--fixtures` | — | `string` | `./tests/conformance-fixtures` | Replay the offline conformance vectors instead of probing a live target. No network, no API key. |
| `--schemas` | — | `string` | bundled | Override the `schemas/v0.1` directory used for JSON Schema validation |
| `--help` | `-h` | `boolean` | — | Show help message |

---

## How It Works

```
┌──────────────────┐       ┌───────────────────┐
│  compliance-cli  │       │  Target Platform  │
│                  │       │                   │
│  1. POST /subscribe ───► │  Creates sub      │
│                  │       │                   │
│  2. ◄── WebSub challenge │  Intent verify    │
│     (GET ?hub.challenge) │                   │
│                  │       │                   │
│  3. POST /test ────────► │  Triggers event   │
│                  │       │                   │
│  4. ◄── POST /hook       │  Delivers webhook │
│     (Verify HMAC)        │                   │
│                  │       │                   │
│  5. Check SSE ──────────►│  Stream endpoint  │
│                  │       │                   │
│  📊 Report Results       │                   │
└──────────────────┘       └───────────────────┘
```

### Step-by-Step Flow

1. **Health check** — Verifies the platform is reachable
2. **EEP discovery** — Checks for `Link: <...>; rel="subscribe"` header on entity pages
3. **Subscription creation** — Creates a webhook subscription via `POST /eep/subscribe`
4. **WebSub Intent Verification** — Waits for the platform to send a GET challenge to the local webhook receiver
5. **Webhook delivery** — Triggers a test event and waits for the webhook to be delivered
6. **Signature verification** — Validates HMAC-SHA256 using the `delivery_secret`
7. **CloudEvents validation** — Checks `specversion`, `id`, `source`, and `eep_version` fields
8. **SSE stream** (Standard+) — Opens an SSE connection and verifies `Content-Type: text/event-stream`
9. **Rate limit headers** (Standard+) — Checks for `X-RateLimit-*` headers

---

## Example Output

```
🔬 EEP Compliance Test — Level: STANDARD
   Target: https://api.example.com
   Entity: u/acme-corp
────────────────────────────────────────────────────────

📋 CORE CONFORMANCE

  ✅ Platform is reachable (HTTP 200)
  ✅ EEP discovery via Link header (rel="subscribe" found)
  ✅ Subscription creation (ID: sub_abc123)
  ✅ WebSub Intent Verification (challenge/response completed within 10s)
  ✅ Webhook delivery received (event type: com.example.entity.test)
  ✅ Standard Webhooks headers present (webhook-id, webhook-timestamp, webhook-signature)
  ✅ HMAC-SHA256 signature is valid (Standard Webhooks v1)
  ✅ CloudEvents specversion is 1.0
  ✅ Event id field present
  ✅ Event source field present
  ✅ EEP extension attributes present (eep_version: 0.1)

📋 STANDARD CONFORMANCE

  ✅ SSE stream endpoint (Content-Type: text/event-stream)
  ✅ Rate limit headers present (X-RateLimit-* headers found)

────────────────────────────────────────────────────────

📊 Results: 13 passed | 0 failed | 0 skipped

   Audit score: 100/100

   🥈 Standard EEP Compliant
```

## Verification & Scoring Workflow

The CLI can act as an automated verifier for projects claiming EEP compliance:

1. Run conformance checks against the target.
2. Compute a normalized score (`score_100`) over evaluated checks.
3. Emit per-check failures with actionable recommendations.
4. Share the generated JSON/markdown report with the target project.

This enables repeatable, automatable audit loops for migration and transition programs.

---

## Architecture

The CLI is a single TypeScript file (~360 lines) with **zero runtime dependencies**. It uses:

- `node:util/parseArgs` — CLI argument parsing
- `node:http/createServer` — Local webhook receiver (receives both WebSub challenges and webhook deliveries)
- `node:crypto` — HMAC-SHA256 signature verification with `timingSafeEqual`
- `fetch` — HTTP requests (built into Node.js 22+)

The local webhook receiver runs on `localhost:9876` (configurable) and handles:
- **GET requests** — WebSub intent verification (echoes `hub.challenge` parameter)
- **POST requests** — Webhook delivery capture and header recording

---

## Network Configuration

The CLI starts a local HTTP server to receive webhooks. The target platform must be able to reach this server.

| Scenario | `delivery_url` |
|----------|---------------|
| Same machine | `http://localhost:9876/hook` |
| Docker → host | `http://host.docker.internal:9876/hook` |
| Cloud dev | Use a tunnel (e.g., `ngrok http 9876`) |

The CLI defaults to `http://host.docker.internal:${port}/hook` for Docker environments.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed — platform is compliant at the requested level |
| `1` | One or more tests failed, or `--help` was invoked without `--target` |

---

## Unit Tests

The CLI's helper functions are thoroughly tested with **34 unit tests** covering:

| Area | Tests | What's Covered |
|------|-------|----------------|
| Test Runner | 11 | pass/fail/skip tracking, summary computation, conformance labels (all 3 levels + failures) |
| Argument Validation | 7 | Missing target, invalid level, port validation (range + NaN) |
| Target Normalization | 4 | Trailing slash removal, multi-slash, path URLs |
| CloudEvents Validation | 5 | Required fields, specversion check, multiple missing fields |
| EEP Extensions | 2 | eep_version presence |
| Webhook Headers | 4 | Standard Webhooks header detection, undefined handling |

```bash
cd packages/@eep-dev/compliance-cli && npx vitest run
```

---

## Specification Reference

- [EEP SPECIFICATION.md](../../../docs/current/SPECIFICATION.md) — The formal specification
- [EEP security.md](../../../docs/current/security.md) — Security model
- [EEP delivery_guarantees.md](../../../docs/current/delivery_guarantees.md) — Retry and backoff requirements
- [CloudEvents v1.0.2](https://cloudevents.io) — Event envelope format
- [Standard Webhooks](https://www.standardwebhooks.com/) — Signature specification

---

## License

Apache 2.0 — See [LICENSE](../../../LICENSE)

