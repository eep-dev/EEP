#!/usr/bin/env bash
# Publish one workspace package to npm from GitHub Actions when the version is new.
# Skips (exit 0) if that exact version already exists on the registry.
#
# Usage (from repo root):
#   scripts/ci-npm-publish-package.sh packages/@eep-dev/signer 0.1.0
#   PRE_PUBLISH='cd ../gates && npm ci && npm run build && node ../../../scripts/npm-publish-rewrite-deps.mjs . 0.1.0' \
#     scripts/ci-npm-publish-package.sh packages/@eep-dev/middleware 0.1.0
#
# Requires: NODE_AUTH_TOKEN, npm logged in via setup-node registry-url.

set -euo pipefail

PKG_DIR="${1:?package directory required}"
VERSION="${2:?version required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT}/${PKG_DIR}"
NAME="$(node -p "require('./package.json').name")"

if npm view "${NAME}@${VERSION}" version >/dev/null 2>&1; then
  echo "npm already has ${NAME}@${VERSION} — skipping publish."
  exit 0
fi

if [ -n "${PRE_PUBLISH:-}" ]; then
  # shellcheck disable=SC2086
  eval "${PRE_PUBLISH}"
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if grep -q '"build"' package.json; then
  npm run build
fi

npm pack --dry-run
npm version "${VERSION}" --no-git-tag-version --allow-same-version
npm publish --access public --provenance
echo "Published ${NAME}@${VERSION}"
