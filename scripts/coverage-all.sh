#!/usr/bin/env bash
# Run Vitest coverage for each @eep-dev package that supports it (local dev / CI helper).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_OPTIONS="${NODE_OPTIONS:-}"

pkgs=(
  "@eep-dev/signer"
  "@eep-dev/validator"
  "@eep-dev/gates"
  "@eep-dev/discovery"
  "@eep-dev/compliance-cli"
  "@eep-dev/mcp-bridge"
  "@eep-dev/middleware"
  "@eep-dev/setup-cli"
)

for rel in "${pkgs[@]}"; do
  dir="$ROOT/packages/$rel"
  if [[ ! -d "$dir" ]]; then
    echo "skip missing $dir" >&2
    continue
  fi
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ $rel"
  (cd "$dir" && npm install --silent 2>/dev/null || npm install)
  if [[ -f "$dir/package.json" ]] && grep -q '"test:coverage"' "$dir/package.json"; then
    (cd "$dir" && npm run test:coverage)
  else
    (cd "$dir" && npx vitest run --coverage)
  fi
done

echo ""
echo "Done. Interpret line % per package from each table (V8 / Vitest)."
