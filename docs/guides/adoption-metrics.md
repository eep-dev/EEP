# Adoption metrics (internal targets)

Use these to track progress on developer experience and ecosystem trust. Adjust targets quarterly.

## Developer experience (DX)

| Metric | How to measure | Starter target |
|--------|----------------|----------------|
| Time-to-first-working-endpoint | Stopwatch from clone → `healthz` 200 (Path A/C in [five-minute-proof.md](./five-minute-proof.md)) | < 15 minutes |
| Setup-cli success rate | % of runs completing `inject` + `apply` + `verify` on a fresh sample repo using only docs | > 80% in internal dogfood |

## Adoption

| Metric | How to measure | Starter target |
|--------|----------------|----------------|
| External repos passing verify | Count of third-party repos linking to EEP or publishing `setup-report.json` | Baseline + growth month over month |
| Docs funnel | Traffic or clicks on setup + integration guides (site analytics) | Week-over-week trend |

## Trust / interoperability

| Metric | How to measure | Starter target |
|--------|----------------|----------------|
| Independent implementations | Number of distinct orgs/repos shipping a passing cross-impl or parity suite | ≥ 2 for “multi-impl” story |
| Published verification artifacts | CI logs or `setup-report.json` shared by adopters | Growing corpus |

## Review cadence

- **Weekly:** DX metrics (smoke scripts, doc issues).
- **Monthly:** adoption + trust metrics; update this file with actuals.
