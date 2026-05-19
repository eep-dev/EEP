#!/usr/bin/env bash
# Publish @eep-dev/* packages to npm in dependency order.
# Prerequisites: npm login with publish access to @eep-dev scope, Node 22+, green tests on main.
# Usage: ./scripts/publish-npm-packages.sh [version]
# Default version: 0.1.0 (must match package.json versions and CHANGELOG ## [version])

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-0.1.0}"

if ! npm whoami >/dev/null 2>&1; then
  echo "error: not logged in to npm. Run: npm login" >&2
  exit 1
fi

build_sibling() {
  local sibling="$1"
  echo "  (building @eep-dev/${sibling} for local file: link)"
  (cd "${ROOT}/packages/@eep-dev/${sibling}" && npm ci && npm run build)
}

publish_pkg() {
  local dir="$1"
  local name
  name="$(node -p "require('${ROOT}/${dir}/package.json').name")"
  echo ""
  echo "════════════════════════════════════════"
  echo "Publishing ${name}@${VERSION} from ${dir}"
  echo "════════════════════════════════════════"
  local rewrote=0
  (
    cd "${ROOT}/${dir}"
    if grep -qE '"file:\.\./' package.json 2>/dev/null; then
      node "${ROOT}/scripts/npm-publish-rewrite-deps.mjs" "${ROOT}/${dir}" "${VERSION}"
      rewrote=1
    fi
    if [ -f package-lock.json ]; then
      npm install
    else
      npm install
    fi
    if grep -q '"build"' package.json; then
      npm run build
    fi
    npm pack --dry-run
    npm version "${VERSION}" --no-git-tag-version --allow-same-version
    npm publish --access public --provenance
    if [ "${rewrote}" -eq 1 ]; then
      git checkout -- package.json package-lock.json 2>/dev/null || git checkout -- package.json 2>/dev/null || true
    fi
  )
  echo "✓ ${name}@${VERSION} published"
}

# Wave 1 — no @eep-dev runtime dependencies
publish_pkg "packages/@eep-dev/signer"
publish_pkg "packages/@eep-dev/validator"
publish_pkg "packages/@eep-dev/gates"
publish_pkg "packages/@eep-dev/discovery"

# Wave 2 — file: siblings must be built; deps rewritten to ^VERSION at publish time
build_sibling gates
publish_pkg "packages/@eep-dev/middleware"
build_sibling gates
publish_pkg "packages/@eep-dev/mcp-bridge"
publish_pkg "packages/@eep-dev/compliance-cli"
publish_pkg "packages/@eep-dev/setup-cli"
build_sibling setup-cli
publish_pkg "packages/@eep-dev/agent-adopt"

echo ""
echo "All @eep-dev packages published at ${VERSION}."
echo "Verify: https://www.npmjs.com/org/eep-dev"
echo ""
echo "Optional: commit registry semver deps (^${VERSION}) in middleware, mcp-bridge, and agent-adopt package.json for consumers."
