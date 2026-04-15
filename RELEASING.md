# Releasing EEP (maintainers)

This document aligns with [.github/workflows/publish.yml](.github/workflows/publish.yml). Follow it so tags, npm, PyPI, and GitHub Releases stay consistent.

## Before you tag

1. **Changelog** — Add a section for the new version at the top of [CHANGELOG.md](./CHANGELOG.md) (Keep a Changelog style). The release job extracts notes with `## [VERSION]` (see workflow `awk`); use the same version string as the tag without `v` if you want automatic release notes (e.g. `## [0.1.1]`).
2. **Semver** — [GOVERNANCE.md](./GOVERNANCE.md): `0.x` allows breaking changes between minors with notice; still bump versions deliberately.
3. **Green CI** — Ensure `main` passes [.github/workflows/test.yml](.github/workflows/test.yml) (or run the same checks locally).
4. **Secrets** — Repository must have `NPM_TOKEN` (npm publish) and `PYPI_TOKEN` (twine) configured where the workflow expects them.

## Tag format

Push a git tag:

- Release: `v0.1.0` (semver)
- Pre-release: `v0.1.0-alpha.1` (prerelease flag on GitHub Release)

The workflow triggers on `v*.*.*` and `v*.*.*-*`.

## What the pipeline publishes

**npm (`@eep-dev/*`):** `gates`, `signer`, `validator`, `compliance-cli`, `discovery`, `mcp-bridge` — see `publish-npm` in the workflow.

**PyPI:** `eep-gates-python`, `eep-signer-python`, `eep-validator-python`, `eep-compliance-cli-python`, `eep-discovery-python`, `eep-mcp-bridge-python` — see `publish-pypi`.

**Not in this workflow:** `@eep-dev/setup-cli`, `@eep-dev/middleware`, `eep-middleware-python`, and other packages may need separate versioning/publish steps until added here.

## After the workflow

- Confirm packages appear on [npm](https://www.npmjs.com/search?q=%40eep-dev) and [PyPI](https://pypi.org/search/?q=eep).
- Verify the GitHub Release body (draft vs. notes from CHANGELOG).
- Announce in [Discussions](https://github.com/eep-dev/EEP/discussions) or release notes if appropriate.

## Hotfix discipline

- Branch from the tagged commit if you must patch an old line; tag `v0.1.2` from that branch and merge back to `main` so history does not diverge silently.
