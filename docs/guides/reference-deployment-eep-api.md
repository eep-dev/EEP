# Reference deployment (`examples/eep-reference-implementation`)

## Scope

`examples/eep-reference-implementation/` is the runnable dual-server reference for protocol adopters (historically referred to as **eep-api**).

- Node runtime: `examples/eep-reference-implementation/node`
- Python runtime: `examples/eep-reference-implementation/python`
- Local infra: `examples/eep-reference-implementation/compose.yml` (Redis + Postgres)

## Implemented protocol surface

- Layer 1 discovery:
  - `GET /.well-known/eep.json`
  - `GET /u/{type}/{id}`
- Layer 2 stream/subscribe:
  - `POST /eep/subscribe`
  - `GET /eep/stream` (SSE)
- Layer 3 pulse:
  - `WS /eep/pulse`
- Gates/services:
  - `GET /eep/gates`
  - `GET /eep/services`
  - gated content route requiring payment proof

## Verification state

- Node reference tests + coverage: 100%
- Python reference tests + coverage: 100%
- Shared parity fixture: `examples/eep-reference-implementation/parity-fixtures.json`

## Quick smoke (running stack)

With Compose up and Node API on port **3100** (default):

```bash
bash scripts/eep-reference-smoke.sh
```

See **[five-minute-proof.md](./five-minute-proof.md)** for copy-paste flows (reference stack, setup-cli, Express mini example).
