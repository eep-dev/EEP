# AGENTS.md — How coding agents work with this repository

**Entity Engagement Protocol (EEP)** — open standard for **push-based, verifiable** communication between digital entities and subscribers (including AI agents). This file is the **fast path** for autonomous tools (Claude Code, Cursor, Cline, OpenClaw, etc.). Read this first, then [`llms.txt`](./llms.txt) or [`llms-full.txt`](./llms-full.txt) for depth.

## What to know in 30 seconds

- **Not** a replacement for MCP (tools), A2A (agent↔agent), or ANP. EEP is **entity engagement**: discovery, **SSE/webhooks**, optional **WebSockets**, **gates** (identity, payment, agreements, …), **signed** deliveries. See [README.md](./README.md) positioning table.
- **Normative truth:** [docs/current/SPECIFICATION.md](./docs/current/SPECIFICATION.md) + [schemas/v0.1/](./schemas/v0.1/).
- **Webhook signatures** (outbound POST to subscribers): **Standard Webhooks**-style headers `webhook-id`, `webhook-timestamp`, **`webhook-signature`** (see spec §5). Do not invent a separate `X-EEP-Signature` for webhook bodies.

## Repository map

| Need | Location |
|------|-----------|
| Full spec | `docs/current/SPECIFICATION.md` |
| JSON Schemas | `schemas/v0.1/` |
| TypeScript packages | `packages/@eep-dev/*` |
| Python ports | `packages/eep-*-python/` |
| Conformance against a **live** URL | `packages/@eep-dev/compliance-cli` |
| Scaffold + generated artifacts | `packages/@eep-dev/setup-cli` (`eep-setup`) |
| HTTP adapters (Express, Fastify, Hono, Koa, FastAPI, …) | `packages/@eep-dev/middleware`, `packages/eep-middleware-python` |
| MCP ↔ EEP HTTP bridge | `packages/@eep-dev/mcp-bridge` |
| **One-shot adopt flow for an app repo** | `packages/@eep-dev/agent-adopt` |
| Agent strategy / launch notes | `docs/strategy/` |
| LangGraph example | `examples/langgraph-eep-agent/` |
| Docker reference stack | `examples/eep-reference-implementation/` |

## Adopt EEP into **another** project (typical agent task)

From the **target application repository** (not necessarily this monorepo):

```bash
# Recommended: use the published package when available
npx @eep-dev/agent-adopt --project .

# Or from a clone of this repo (development)
node path/to/EEP/packages/@eep-dev/agent-adopt/dist/index.js --project .
```

This runs **`inject` → `apply` → `verify`**, optional **framework wiring** (Express/FastAPI when detectable), and writes **`EEP_ADOPTION_REPORT.md`** at the project root.

Exact steps and flags: [docs/strategy/agent-adoption-strategy.md](./docs/strategy/agent-adoption-strategy.md).

### Manual equivalent (if you cannot use agent-adopt)

```bash
cd /path/to/target-app
npx @eep-dev/setup-cli inject --project . --out ./eep-setup.json
# Edit eep-setup.json: identity.base_url, identity.did, etc.
npx @eep-dev/setup-cli apply --config ./eep-setup.json --output ./eep-generated
npx @eep-dev/setup-cli verify --output ./eep-generated
```

Then **wire** your HTTP server per [docs/guides/integrate-eep-after-setup-cli.md](./docs/guides/integrate-eep-after-setup-cli.md). Generated files under `eep-generated/` are not magic — your process must mount routes or serve them.

## Verify a **deployed** EEP-compatible base URL

Requires Node **≥ 22** for `@eep-dev/compliance-cli` (see its `package.json` `engines`). You need a reachable **target**, **API key** (if required), and **entity** path as needed by that deployment.

```bash
npx @eep-dev/compliance-cli \
  --target https://api.example.com \
  --api-key YOUR_KEY \
  --entity u/example \
  --report-md ./eep-audit.md \
  --report-json ./eep-audit.json
```

Interpretation: [docs/guides/agent-onboarding.md](./docs/guides/agent-onboarding.md).

## Work **inside** this EEP repo (contributors / CI)

```bash
bash scripts/bootstrap.sh
bash test.sh
```

Details: [TESTING.md](./TESTING.md).

## Security

- Reports: **hello@eep.dev** with `[Security]` in the subject — [SECURITY.md](./SECURITY.md).
- Do not commit real API keys or webhook secrets. Use env vars (`EEP_WEBHOOK_SECRET`, etc.).

## Limits (do not over-promise)

- v0.1 may still change — pin versions; read [CHANGELOG.md](./CHANGELOG.md).
- **Full** automated compliance coverage is **partial**; see compliance-cli README.
- No guaranteed search ranking or traffic — GEO is informative only (see README).

## See also

- [docs/strategy/distribution-checklist-d0.md](./docs/strategy/distribution-checklist-d0.md) — where to list the MCP bridge  
- [docs/strategy/screencast-runbook-d0.md](./docs/strategy/screencast-runbook-d0.md) — demo script for a ≤60s video
