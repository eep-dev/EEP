# EEP Observability Baseline

This document defines minimum metrics, traces, logs, and dashboards for operating EEP safely.

## Telemetry Principles

- Use OpenTelemetry for metrics and traces.
- Keep log schema stable and machine-parseable.
- Include correlation IDs across request, event, and delivery paths.

## Required Metric Set

### Protocol Health

- `eep.http.requests_total` (labels: `path`, `status`, `method`, `tenant_id`)
- `eep.http.request_latency_ms` (histogram)
- `eep.sse.active_connections`
- `eep.ws.active_sessions`

### Security and Integrity

- `eep.signature.verify_failures_total`
- `eep.replay.detected_total`
- `eep.nonce.consumed_total`
- `eep.payment.double_spend_detected_total`
- `eep.ssrf.blocked_total`

### Delivery and Resilience

- `eep.webhook.queue_depth`
- `eep.webhook.retries_total`
- `eep.webhook.dlq_total`
- `eep.webhook.delivery_latency_ms`

## Trace Conventions

- Span names:
  - `eep.resolve_access`
  - `eep.validate_proof_structure`
  - `eep.validate_nonce`
  - `eep.webhook.dispatch`
  - `eep.webhook.verify_signature`
- Required span attributes:
  - `eep.source_did`
  - `eep.agent_did` (if available)
  - `eep.event_type`
  - `eep.transport`
  - `eep.tenant_id`

## Structured Log Schema

Every security-sensitive log line should include:

- `timestamp`
- `severity`
- `trace_id`
- `span_id`
- `tenant_id`
- `source_did`
- `agent_did` (if present)
- `event` (e.g., `replay_detected`, `double_spend_detected`, `signature_mismatch`)
- `action` (e.g., `blocked`, `allowed`, `retry_scheduled`)

Do not log secrets, raw bearer tokens, or private key material.

## Runtime Telemetry Hook (gates package)

`@eep-dev/gates` exposes critical metric names and a global recorder hook:

```typescript
import {
  setGlobalSecurityTelemetryRecorder,
  CRITICAL_SECURITY_METRICS
} from '@eep-dev/gates';

setGlobalSecurityTelemetryRecorder({
  emit(metric, value, attrs) {
    // bridge to OpenTelemetry, StatsD, Prometheus, etc.
    console.log(metric, value, attrs);
  }
});
```

## Dashboard Minimums

1. **Protocol Overview**
   - request rate, error rate, p95 latency by layer.
2. **Delivery Reliability**
   - success rate, retry rate, DLQ trend, queue depth.
3. **Security Posture**
   - signature failures, replay detections, SSRF blocks, double-spend detections.
4. **Tenant Isolation**
   - top failing tenants/endpoints, noisy-neighbor impact view.

## Synthetic Checks

- Every 5 minutes:
  - verify `/.well-known/eep.json`
  - verify a gated endpoint returns deterministic 402 schema
  - verify webhook signature path with known-good fixture
  - verify SSE endpoint headers and reconnect support.
