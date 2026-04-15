# EEP SLO/SLI Policy

This document defines baseline operational objectives for production EEP publishers.

## Scope

- Layer 1: state resolution endpoints
- Layer 2: webhook + SSE delivery
- Layer 3: websocket pulse sessions
- Control-plane actions: gate evaluation and subscription lifecycle

## Availability SLOs

| Service surface | SLI | Objective (30d) |
|---|---|---|
| Layer 1 read APIs | successful requests / total requests | >= 99.95% |
| Webhook delivery service | successful attempts within retry window / scheduled events | >= 99.90% |
| SSE stream service | stream sessions that sustain >= 5 min without server fault / total sessions | >= 99.90% |
| WebSocket pulse | successful session upgrades / total upgrade attempts | >= 99.90% |

## Latency SLOs

| Surface | SLI | Objective |
|---|---|---|
| Layer 1 read APIs | p95 end-to-end response time | <= 300 ms |
| Gate evaluation (`resolveAccess`) | p95 server-side evaluation time | <= 50 ms |
| Webhook dispatch | p95 enqueue-to-first-attempt delay | <= 5 s |
| SSE delivery | p95 event publication-to-emit lag | <= 2 s |

## Correctness and Security SLOs

| Domain | SLI | Objective |
|---|---|---|
| Signature verification | invalid signature false-positive rate | 0 |
| Replay prevention | accepted replay attempts / replay attempts | 0 |
| Double-spend prevention | accepted duplicate payment hashes / duplicate submissions | 0 |
| SSRF protection | blocked unsafe callback URLs / unsafe callback URLs | 100% |

## Error Budget Policy

- For each 30-day SLO, the error budget is `1 - SLO`.
- If any surface spends >50% budget before day 15:
  - Freeze non-critical releases for that surface.
  - Require rollback-ready deploys and explicit incident commander sign-off.
- If any surface spends >80% budget:
  - Enter reliability mode: only reliability/security fixes until budget trend is stable.

## Measurement Notes

- All SLI counters are emitted as OpenTelemetry metrics and tagged by:
  - `layer`, `transport`, `publisher_did`, `tenant_id`, `region`.
- Event timestamps used for lag SLIs must be UTC and monotonic per stream partition.
