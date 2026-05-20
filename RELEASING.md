# Releasing EEP (maintainers)

This document is the authoritative runbook for publishing an EEP
release. It is the human-readable counterpart to
[`.github/workflows/publish.yml`](.github/workflows/publish.yml).
Follow it so that every release is signed, attested, reproducible, and
gated behind a manual approval.

## Pre-release checklist

Before pushing a tag:

1. **Changelog.** Add a `## [<VERSION>] - YYYY-MM-DD` section at the
   top of [CHANGELOG.md](./CHANGELOG.md). The workflow extracts notes
   by matching `## [<VERSION>]`. The version string in the heading
   must match the tag without the `v` prefix.
2. **Semver discipline.** Re-read
   [GOVERNANCE.md § Versioning policy](./GOVERNANCE.md#versioning-policy).
   Pre-1.0 still allows breaking changes between minors with the
   30-day notice; respect it.
3. **NOTICE file.** If you added a runtime dependency with its own
   NOTICE/attribution, propagate the attribution into our [NOTICE](./NOTICE)
   file in the same PR.
4. **Green CI on `main`.** Push of a tag with red CI on `main` is the
   same defect as publishing red code; do not do it.
5. **Conformance fixtures.** Run
   `node tests/conformance-fixtures/`-driven self-tests locally:
   `pnpm --filter ./tests test`. CI also runs them.
6. **Provenance preflight.** The workflow's `preflight` job runs the
   full TypeScript + Python + cross-impl test matrix and the npm /
   pip vulnerability gates before any publish step is allowed to
   start. Tag pushes that fail preflight do not publish anything.

## Local PyPI publish (maintainers)

After npm packages exist at the target version (no cross-Python dependency on them):

```bash
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-<your-api-token>   # upload scope for all eep-* projects
pip install build twine
./scripts/publish-pypi-packages.sh 0.1.0
```

**PyPI HTTP 429 (Too Many Requests).** The upload API (`upload.pypi.org`)
limits how many **file upload POSTs** your account/IP can make in a window.
Uploading seven packages × (wheel + sdist) in one session, then **re-running
the script while it retries five times per failure**, can keep you rate-limited
for much longer than “wait an hour”.

### If 429 persists for hours

1. **Stop all upload attempts** (including the publish script) for **12–24 hours**.
   Further retries often extend the limit.
2. Confirm what is already live:  
   `curl -fsS https://pypi.org/pypi/eep-compliance-cli/json | head` → 404 means
   the project was never created (nothing partial to fix).
3. Upload **one package, one wheel only**, with verbose logging:

```bash
cd packages/eep-compliance-cli-python
python3 -m pip install -U build twine
rm -rf dist && python3 -m build && twine check dist/*
export TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-...
twine upload --verbose dist/*.whl
# wait 30+ minutes before uploading dist/*.tar.gz (optional; wheel alone is enough for pip)
```

4. Repeat for `eep-mcp-bridge-python` and `eep-middleware-python` with long gaps.

### Resume with the script (after the cooldown)

```bash
PYPI_WHEEL_ONLY=1 PYPI_PAUSE_SEC=300 ./scripts/publish-pypi-packages.sh 0.1.0 \
  --from eep-compliance-cli-python --skip-existing
```

`PYPI_WHEEL_ONLY=1` uploads only the wheel (half the POSTs). The script now
uploads **one file per `twine` call**, pauses **120s** between packages by default,
and only retries on **429** (max 2 retries, 10-minute initial backoff).

### Preferred alternative: GitHub Actions + Trusted Publishing

Avoid local IP/account upload quotas entirely:

1. On [pypi.org](https://pypi.org), create projects (if needed) and add a
   **Trusted Publisher** for each of `eep-compliance-cli`, `eep-mcp-bridge`,
   `eep-middleware` pointing at this repo, workflow `publish.yml`, environment `release`.
2. Push tag `v0.1.0` (or a patch tag `v0.1.1` if you prefer a fresh release).
3. Approve the **`release`** environment in GitHub Actions.

The workflow matrix publishes one package per job (OIDC, no API token in the shell).
If four packages are already at `0.1.0`, either temporarily limit the matrix to the
three missing dirs or accept “file already exists” on the four (harmless).

### Other options

- **TestPyPI** (`twine upload --repository testpypi`) to verify credentials without
  touching production quota.
- **PyPI support**: [pypi.org/support](https://pypi.org/support/) if uploads still
  return 429 after 24h with no retries.
- Check token scope: use an **account-wide** upload token (or Trusted Publishing),
  not a token limited to other project names only.

Register each PyPI project name once (`eep-signer`, `eep-gates`, …) or uploads will fail with
403/404. For CI, configure **Trusted Publishing** per project (see below) instead of tokens.

Prefer `git push origin v0.1.0` + GitHub Actions `publish-pypi` when you want OIDC and the
`release` environment approval gate.

### Publish PyPI from GitHub Actions (checklist)

1. **PyPI Trusted Publisher** (once per project name): [pypi.org](https://pypi.org) →
   Your projects → *Manage* → *Publishing* → add publisher:
   - PyPI project: `eep-compliance-cli` (repeat for `eep-mcp-bridge`, `eep-middleware`, …)
   - Owner: `eep-dev` (or your org)
   - Repository: `EEP`
   - Workflow: `publish.yml`
   - Environment: `release`
2. **GitHub Environment** `release`: repo *Settings* → *Environments* → `release` →
   required reviewers (see [What the pipeline does](#what-the-pipeline-does)).
3. **Green CI on the commit** you will tag (`test.yml` on `main`).
4. **Tag and push** (version must match `CHANGELOG.md` `## [x.y.z]`):

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. Open the workflow run → approve **`release`** when `publish-pypi` waits.
6. Watch job **Publish PyPI packages** (matrix runs **one package at a time**).
   Packages already at that version on PyPI may log “file already exists”; that is OK.

No `TWINE_PASSWORD` in GitHub secrets is required when Trusted Publishing is configured.

## Local npm publish (maintainers)

After `npm login` with publish access to the `@eep-dev` scope:

```bash
./scripts/publish-npm-packages.sh 0.1.0
```

This publishes all nine packages in dependency order (same sequence as
`publish.yml`). Each package sets `publishConfig.provenance: true`; the local script
temporarily removes that field before `npm publish` (npm ignores env-only
disables when `provenance` stays in `package.json`). Prefer the
tag-driven GitHub workflow when you want SBOM, provenance, and manual
`release` environment approval.

## Tag format

```bash
git tag -s v0.1.1 -m "Release v0.1.1"      # signed; preferred
# or
git tag v0.1.1
git push origin v0.1.1
```

Pre-releases follow `v0.1.1-alpha.1`, `v0.1.1-beta.2`, `v0.1.1-rc.1`
— anything matching `v[0-9]+.[0-9]+.[0-9]+-*` is automatically marked
as a pre-release on the GitHub Release.

## What the pipeline does

The pipeline is structured as five sequential jobs. Manual reviewer
approval is required before any of the publish jobs are allowed to
run, via the `release` GitHub Environment.

| Stage | Job | Purpose |
|---|---|---|
| 1 | `preflight` | All tests pass; no high-severity npm/pip audit findings; cross-impl tests against the live node-gate-publisher pass. |
| 2 | `sbom` | Generates a CycloneDX SBOM for the whole repository (`eep-sbom.cdx.json`), uploaded as an artifact and attached to the eventual GitHub Release. |
| 3 | `publish-npm` | **Manual approval gate**, then publishes every `@eep-dev/*` package with **`npm publish --provenance`** (SLSA build attestation via OIDC). |
| 4 | `publish-pypi` | **Manual approval gate**, then publishes every `eep-*-python` package via **PyPI Trusted Publishing (OIDC)** — no PyPI token is used or required. |
| 5 | `create-github-release` | Builds the whitepaper PDF (best-effort), packs the conformance-fixture tarball, signs every artifact with **sigstore/cosign** keyless OIDC, and creates the GitHub Release with all artifacts attached. |

### Manual approval

The `release` environment is configured in repo settings with two
required reviewers. When a tag triggers the workflow, the publish jobs
sit in `Waiting for review` until two maintainers approve. Reviewers
should:

1. Compare the tag's commit to the previous release's commit.
2. Verify the changelog entry.
3. Verify the SBOM artifact's contents on the workflow run page.
4. Approve.

### Provenance and signatures

Once published, consumers can verify provenance:

```bash
npm view @eep-dev/gates dist.signatures
# Should list signature attestations (SLSA build provenance).
```

For PyPI:

```bash
pip download --no-deps eep-gates
# Then verify the published Trusted Publisher attestations in PyPI's UI.
```

For GitHub Release artifacts:

```bash
cosign verify-blob \
  --certificate eep-sbom.cdx.json.pem \
  --signature eep-sbom.cdx.json.sig \
  --certificate-identity-regexp 'https://github.com/eep-dev/EEP/.github/workflows/publish.yml@.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  eep-sbom.cdx.json
```

## What the pipeline publishes

| Registry | Package | Source path |
|---|---|---|
| npm | `@eep-dev/signer` | `packages/@eep-dev/signer` |
| npm | `@eep-dev/validator` | `packages/@eep-dev/validator` |
| npm | `@eep-dev/gates` | `packages/@eep-dev/gates` |
| npm | `@eep-dev/discovery` | `packages/@eep-dev/discovery` |
| npm | `@eep-dev/middleware` | `packages/@eep-dev/middleware` |
| npm | `@eep-dev/mcp-bridge` | `packages/@eep-dev/mcp-bridge` |
| npm | `@eep-dev/compliance-cli` | `packages/@eep-dev/compliance-cli` |
| npm | `@eep-dev/setup-cli` | `packages/@eep-dev/setup-cli` |
| npm | `@eep-dev/agent-adopt` | `packages/@eep-dev/agent-adopt` |
| PyPI | `eep-signer` | `packages/eep-signer-python` |
| PyPI | `eep-validator` | `packages/eep-validator-python` |
| PyPI | `eep-gates` | `packages/eep-gates-python` |
| PyPI | `eep-discovery` | `packages/eep-discovery-python` |
| PyPI | `eep-middleware` | `packages/eep-middleware-python` |
| PyPI | `eep-mcp-bridge` | `packages/eep-mcp-bridge-python` |
| PyPI | `eep-compliance-cli` | `packages/eep-compliance-cli-python` |
| GitHub Release | `eep-sbom.cdx.json`, `eep-whitepaper.pdf`, `eep-conformance-vectors-vX.Y.Z.tar.gz`, signatures | `release-artifacts/` |

## Required GitHub configuration

These are one-time setup steps for the repo. Re-check them whenever a
new maintainer is onboarded.

1. **`release` environment**: Settings → Environments → New environment
   `release`. Required reviewers: at least two core-team members.
2. **`NPM_TOKEN` secret**: Stored on the `release` environment only.
3. **PyPI Trusted Publishing**: For each PyPI project, add a Trusted
   Publisher pointing to:
   - Repository: `eep-dev/EEP`
   - Workflow: `publish.yml`
   - Environment: `release`
4. **Branch protection on `main`**:
   - Require pull request reviews (≥1 from CODEOWNERS).
   - Require status checks (the matrix from `test.yml`).
   - Require signed commits.
   - Restrict tag push to the `release` environment's reviewers.
5. **Renovate**: Enable the [Renovate app](https://github.com/apps/renovate)
   for SHA-pinning GitHub Actions and weekly dependency updates per
   `.github/renovate.json`.

## After the release

- Confirm packages appear on
  [npm](https://www.npmjs.com/org/eep-dev) and
  [PyPI](https://pypi.org/search/?q=eep).
- Confirm the GitHub Release lists the SBOM, whitepaper PDF (if the
  build succeeded), conformance fixtures tarball, and a `.sig` /
  `.pem` for each.
- Spot-check provenance on one npm package and one PyPI package per
  the commands above.
- Open a PR moving the version-bumped roadmap item from
  [ROADMAP.md](./ROADMAP.md) "Now" to "done" (deletion).
- Announce on [Discussions](https://github.com/eep-dev/EEP/discussions),
  with a link to the release page and the conformance-fixture tarball.

## Hotfix discipline

- Branch from the tagged commit (`git checkout -b hotfix/v0.1.2 v0.1.1`).
- Cherry-pick the fix only.
- Tag `v0.1.2` and push.
- Merge back to `main` afterwards so the history does not diverge.
- A hotfix release reuses the same `release` environment and the same
  reviewer requirements; do not bypass them.

## When something goes wrong

- A failing publish step does **not** roll back the parts that already
  succeeded. If npm publishes 5 of 9 packages and PyPI fails, address
  PyPI Trusted Publishing config, re-run only the `publish-pypi` job
  via the workflow re-run UI. Do not yank the npm packages.
- An npm package published with a wrong version is **deprecated** with
  `npm deprecate`, never unpublished.
- If a release artifact is found to leak a secret, file a security
  advisory per [SECURITY.md](./SECURITY.md), then issue a follow-up
  patch release.
