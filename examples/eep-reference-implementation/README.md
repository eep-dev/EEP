# EEP reference implementation (`examples/eep-reference-implementation`)

This directory is the deployment-grade EEP reference stack (historically referred to as **eep-api**). It gives developers a runnable, end-to-end publisher implementation that demonstrates the complete EEP interaction model in two runtimes.

## What it provides

- `node/` - Node.js reference API
- `python/` - FastAPI reference API
- `compose.yml` - full local stack (Postgres + Redis + both APIs)

Both APIs expose:

- `GET /.well-known/eep.json`
- `GET /.well-known/eep-registry.json` (federation economics demo)
- `GET /u/{type}/{id}`
- `GET /eep/services`
- `GET /eep/gates`
- `POST /eep/subscribe`
- `GET /eep/stream` (SSE)
- `GET /eep/content/{entity_did}/{resource}` (payment + combined-gate examples)
- `POST /eep/trust/graduate`, `GET /eep/trust-status` (cold-start trust demo)
- `POST /eep/delegation/verify` (delegation vs `data_request` privacy binding)
- `WS /eep/pulse` (includes `commerce.dispute.*` mock resolution)
- `GET /healthz`

Both APIs are wired to:

- **Postgres** for subscription persistence
- **Redis** for pub/sub emission on subscription creation

When database/cache is unavailable, each runtime still works with in-memory fallback (for local/dev resilience).

## Run end-to-end with Docker Compose

```bash
# From the EEP repository root:
cd examples/eep-reference-implementation

# If your checkout nests the EEP repo inside a larger monorepo, use:
# cd EEP/examples/eep-reference-implementation

docker compose up --build
```

> Docker daemon must be running (`docker info` should succeed).

Services:

- Node API: `http://localhost:3100`
- Python API: `http://localhost:3200`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Python dependency

The FastAPI service depends on the **`eep-gates`** Python package from `packages/eep-gates-python` (declared as a `file:` dependency in `python/pyproject.toml`). Install from the repo root so relative paths resolve, or `pip install -e ../../packages/eep-gates-python` before the reference app.

## Smoke checks

```bash
# Node runtime
curl -s http://localhost:3100/healthz
curl -s http://localhost:3100/.well-known/eep.json
curl -s http://localhost:3100/.well-known/eep-registry.json
curl -s -X POST http://localhost:3100/eep/subscribe -H 'content-type: application/json' -d '{"source_did":"did:web:test","delivery_method":"sse"}'
curl -s http://localhost:3100/eep/stream

# Python runtime
curl -s http://localhost:3200/healthz
curl -s http://localhost:3200/.well-known/eep.json
curl -s http://localhost:3200/.well-known/eep-registry.json
curl -s -X POST http://localhost:3200/eep/subscribe -H 'content-type: application/json' -d '{"source_did":"did:web:test","delivery_method":"sse"}'
curl -s http://localhost:3200/eep/stream

# Automated smoke test (expects both APIs already running)
bash smoke.sh
```

## Publishing / production deployment

1. Build and push both runtime images (or build in CI).
2. Set production env vars:
   - `EEP_DATABASE_URL`
   - `EEP_REDIS_URL`
   - `PORT` (Node)
3. Deploy behind TLS reverse proxy.
4. Expose `/.well-known/eep.json` publicly.
5. Add DNS + Link discovery metadata.
6. Run EEP compliance checks against deployed endpoint.
