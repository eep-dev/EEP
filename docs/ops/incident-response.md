# EEP Incident Response

This runbook defines the minimum incident lifecycle for EEP production operations.

## Severity Model

| Sev | Definition | Target update cadence |
|---|---|---|
| Sev1 | Major outage, data integrity risk, or security compromise | every 15 min |
| Sev2 | Partial outage or severe performance degradation | every 30 min |
| Sev3 | Limited-scope issue with workaround | every 60 min |

## Roles

- **Incident Commander (IC):** owns timeline and decisions.
- **Ops Lead:** handles mitigation and rollback.
- **Comms Lead:** internal/external updates.
- **Security Lead:** mandatory for replay, signature, SSRF, credential, or payment-hash anomalies.

## Triage Checklist

1. Confirm user impact and blast radius (`tenant`, `region`, `layer`).
2. Classify severity.
3. Freeze high-risk releases for affected surfaces.
4. Capture first five indicators:
   - error rate
   - latency
   - queue depth
   - signature/replay failures
   - recent deploy/config changes
5. Open incident channel and assign IC.

## Containment Actions (Ordered)

1. Enable safe degradation:
   - rate-limit non-critical traffic
   - isolate noisy tenants
   - open circuit on failing webhook endpoints
2. Roll back latest risky change.
3. Shift traffic to healthy region (if configured).
4. Drain and replay failed webhook queue from last known-good checkpoint.
5. Re-enable normal mode only after 30-minute stability window.

## Security Incident Overrides

For suspected spoofing/replay/double-spend:

- Rotate webhook secrets for impacted subscriptions.
- Invalidate active challenge nonces and session tokens.
- Force `markConsumed` nonce checks and payment-hash dedupe strict mode.
- Enable enhanced audit logs for:
  - `webhook-id`
  - `webhook-timestamp`
  - `agent_did`
  - `nonce`
  - `tx_hash` or x402 hash.

## Post-Incident Requirements

- Publish internal postmortem within 48 hours.
- Document:
  - timeline
  - root cause
  - what detection missed
  - preventive actions with owners and due dates.
- Add at least one regression test or monitor for each escaped failure mode.
