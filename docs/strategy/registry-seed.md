# Public adopters registry (seed design)

**Purpose:** A small, **honest** list of EEP-related deployments and integration points so the landing site is not empty on day zero. This is **not** a network-effect guarantee; it is **social proof of integration work**.

## Machine-readable shape

Canonical file: [registry/adopters.json](../../registry/adopters.json) (versioned in git).

| Field | Type | Notes |
|--------|------|--------|
| `id` | string | Stable slug, e.g. `eep-reference-implementation` |
| `name` | string | Display name |
| `kind` | string | e.g. `reference`, `example`, `integration`, `site` |
| `description` | string | One line; no superlatives |
| `url` | string? | Public HTTPS if any |
| `source` | string? | GitHub path or `local` for in-repo only |
| `conformance` | string? | e.g. `core`, `standard` (self-reported) |

## Seed entries (initial set)

1. **EEP reference stack** — `examples/eep-reference-implementation/` (Docker, Node + Python; behavioral reference for protocol).
2. **EEP monorepo** — This repository; spec + packages + tests.
3. **eep-site** — Landing site and playground (separate repo in same org when published: `github.com/eep-dev/eep-site`).
4. **MCP bridge package** — [`@eep-dev/mcp-bridge`](../../packages/@eep-dev/mcp-bridge/); tool-runtime bridge to EEP-shaped HTTP.
5. **LangGraph / agent example** — [`examples/langgraph-eep-agent/`](../../examples/langgraph-eep-agent/).

**Maintainers:** When a real external service lists itself, add a row via PR; prefer links that include **conformance** or **blog** evidence.

## Page on eep-site

**Route:** `/adopters` — static page that reads **`eep-site/data/adopters.json`** (kept in sync with [registry/adopters.json](../../registry/adopters.json) in this repo; update both in the same PR when the list changes).
