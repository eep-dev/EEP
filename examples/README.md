# Examples

- **`eep-reference-implementation/`** — Dual-runtime (Node + Python) EEP publisher with Docker Compose, Postgres, and Redis. See that directory’s README for ports and smoke checks. From the repo root: `bash scripts/eep-reference-smoke.sh` (with the stack running).
- **`eep-middleware-express-mini/`** — Minimal Express app wiring for `@eep-dev/middleware`.
- **`node-gate-publisher/`** — Hono gate publisher used by CI and by `tests/cross-impl` (starts on port **3002** by default).
- **`node-express-subscriber/`**, **`python-fastapi-subscriber/`**, **`python-gate-subscriber/`** — Subscriber and 402/proof examples.
- **`langgraph-eep-agent/`** — LangGraph + Claude agent that subscribes to EEP events, handles 402/403 gates, verifies HMAC signatures, and processes events through a Claude-powered pipeline. See [integration guide](../docs/guides/langgraph-eep-agent.md).
- **`cross-impl/`** — **Legacy** interoperability harness kept for history. Active protocol tests live under **`../tests/cross-impl/`** (see that README).
