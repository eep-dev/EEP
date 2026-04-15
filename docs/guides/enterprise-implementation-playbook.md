# EEP Enterprise Implementation Playbook

This playbook is for organizations that want to adopt EEP with low risk and fast time-to-value.
Follow the phases in order.

## Phase 0 — Readiness (1-3 days)

- Assign owners:
  - Platform owner (API/event surfaces)
  - Security owner (auth/signing/SSRF/replay)
  - Operations owner (SLO/incident/observability)
- Confirm baseline runtime:
  - Node.js >= 22 for CLI and TS workflows
  - Python >= 3.10 for Python package/tooling workflows
- Pick initial conformance target:
  - Core for pilot
  - Standard for production baseline

## Phase 1 — Minimum Viable EEP (Core)

1. Expose discovery and manifest:
   - `/.well-known/eep.json`
   - Link-header based entity discovery
2. Implement subscription flow:
   - `POST /eep/subscribe`
   - WebSub intent verification
3. Implement secure webhook dispatch:
   - Standard Webhooks headers
   - HMAC SHA-256 signing
   - 60-second replay window

## Phase 2 — Secure Gate Controls (Standard)

1. Implement gate config and access resolver integration.
2. Register semantic verifiers for each active requirement type.
3. Keep fail-closed behavior:
   - No verifier => requirement unmet => access denied.
4. Enable SSE stream and rate-limit headers.

## Phase 3 — Reliability and Zero-Trust Operations

1. Adopt SLO/SLI baselines from:
   - `docs/ops/slo.md`
   - `docs/ops/incident-response.md`
   - `docs/ops/runbook-webhook-delivery.md`
2. Wire telemetry for security-critical checks:
   - replay detected
   - nonce consumed
   - double-spend detected
3. Add dependency policy gates:
   - `npm audit`
   - `pip-audit`

## Phase 4 — Automated Verification and Scoring

Use `@eep-dev/compliance-cli` as your external verifier:

```bash
npx @eep-dev/compliance-cli \
  --target https://api.yourplatform.com \
  --api-key YOUR_KEY \
  --entity u/your-entity \
  --level full \
  --report-json ./eep-audit-report.json \
  --report-md ./eep-audit-report.md
```

Gate recommendation:

- Block production promotion if:
  - any `fail` result exists
  - score drops below your internal threshold (recommended >= 90 for rollout, 100 for certification badges)

## Phase 5 — Rollout Strategy

- Pilot with one entity and one subscriber profile.
- Enable canary release gates in CI.
- Expand to more entities by template reuse.
- Re-run compliance CLI audits on each release candidate.

## Practical Checklist

- [ ] Discovery + manifest endpoint live
- [ ] Subscription + intent verification pass
- [ ] Signed webhook deliveries pass
- [ ] Strict fail-closed gate resolution enabled
- [ ] Verifier registry coverage complete for active requirement types
- [ ] SSE + rate-limit checks pass
- [ ] Compliance CLI report generated and archived in CI artifact store

## Common Failure Patterns

1. Structural proof validation implemented, semantic verifier missing.
2. Replay window mismatch between docs/code/examples.
3. Production release tag created without compliance report evidence.

Use this playbook with:

- `docs/guides/testing-and-validation.md`
- `docs/guides/how-to-dispatch.md`
- `docs/guides/how-to-subscribe.md`
