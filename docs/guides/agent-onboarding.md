# Agent Onboarding Guide (Clone -> Verify -> Report)

This guide is designed for coding agents and automation pipelines.

## Goal

After cloning EEP, an agent should be able to:

1. Install dependencies
2. Run protocol and package validations
3. Generate an EEP compliance score/report for a target platform

## Step 1 — Clone

```bash
git clone https://github.com/eep-dev/EEP
cd EEP
```

Landing page repository (optional):

```bash
git clone https://github.com/eep-dev/eep-site
```

## Step 2 — Bootstrap local workspace

```bash
bash scripts/bootstrap.sh
```

This script installs required TS/Python dependencies used by tests and examples.

## Step 3 — Run local verification suite

```bash
bash test.sh
```

## Step 4 — Audit any platform that claims EEP support

```bash
npx @eep-dev/compliance-cli \
  --target https://api.target-platform.com \
  --api-key YOUR_KEY \
  --entity u/target-entity \
  --level full \
  --report-json ./eep-audit-report.json \
  --report-md ./eep-audit-report.md
```

## Step 5 — Interpret results

- `status: pass` and high score => candidate is close to compliant.
- Any failed checks => remediation required before claiming conformance.
- Share markdown report with platform team for a direct fix list.

## Recommended CI Integration

Use this minimum logic in CI:

1. Run local tests (`bash test.sh`).
2. Run compliance CLI against staging target.
3. Fail pipeline if:
   - report has failed checks
   - score drops below required threshold.

## Notes

- Strict fail-closed access semantics are default in EEP gates.
- Requirement types without semantic verifiers are treated as unmet.
- Legacy structural-only fallback is available but should not be used in production certification flows.
