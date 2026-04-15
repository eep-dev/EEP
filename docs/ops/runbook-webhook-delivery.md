# Webhook Delivery Runbook

Operational runbook for Layer 2 webhook delivery reliability.

## Normal Delivery Contract

- Delivery guarantee: at-least-once.
- Auth: Standard Webhooks-compatible HMAC.
- Retry strategy: exponential backoff with jitter.
- Terminal failures go to DLQ for replay or manual remediation.

## Key Signals

- `webhook.delivery.success_rate`
- `webhook.delivery.retry_rate`
- `webhook.delivery.dlq_rate`
- `webhook.delivery.queue_depth`
- `webhook.delivery.p95_latency_ms`

## Alert Thresholds

- success rate < 99.0% for 10 minutes
- DLQ rate > 0.5% for 10 minutes
- queue depth growing continuously for 15 minutes
- p95 delivery latency > 60s for 10 minutes

## Recovery Procedure

1. Validate sender health:
   - Can workers dequeue?
   - Are signatures generated correctly?
2. Validate receiver health:
   - spikes in 429/5xx?
   - endpoint timeouts?
3. Enable circuit breaking for failing endpoints.
4. Apply tenant throttling where needed.
5. Replay queue in order:
   - oldest first
   - bounded concurrency per tenant.
6. Inspect DLQ samples and classify:
   - permanent 4xx
   - retriable 5xx/timeouts
   - auth/signature mismatch.

## Signature Failure Handling

When signature mismatch spikes:

1. Verify raw-body signing path is unchanged.
2. Verify `webhook-id`, `webhook-timestamp`, `webhook-signature` presence.
3. Check replay tolerance window and NTP drift.
4. If secret leak suspected, rotate endpoint secrets immediately.

## Manual Replay Procedure

- Select tenant + time window.
- Replay with idempotency key preserved (`webhook-id` unchanged).
- Limit replay batches to avoid retry storms.
- Verify receiver ack rate before next batch.

## Exit Criteria

- success rate recovered above threshold for 30 minutes
- queue depth trending down and stable
- DLQ growth stopped
- no active Sev1/Sev2 conditions on webhook surface.
