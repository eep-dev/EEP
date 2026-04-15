#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> EEP bootstrap starting"
echo "    root: $ROOT_DIR"

echo ""
echo "==> Installing TypeScript package dependencies"
for dir in \
  "$ROOT_DIR/tests" \
  "$ROOT_DIR/packages/@eep-dev/gates" \
  "$ROOT_DIR/packages/@eep-dev/signer" \
  "$ROOT_DIR/packages/@eep-dev/validator" \
  "$ROOT_DIR/packages/@eep-dev/compliance-cli"
do
  echo " -> npm ci in ${dir#$ROOT_DIR/}"
  (cd "$dir" && npm ci)
done

echo " -> npm install in packages/@eep-dev/discovery (no lockfile)"
(cd "$ROOT_DIR/packages/@eep-dev/discovery" && npm install)

echo " -> npm install in examples/node-gate-publisher"
(cd "$ROOT_DIR/examples/node-gate-publisher" && npm install)

echo ""
echo "==> Installing Python test dependencies"
python3 -m pip install --upgrade pip
python3 -m pip install \
  pytest \
  pytest-asyncio \
  pydantic \
  httpx \
  pip-audit

echo " -> cross-impl requirements"
python3 -m pip install -r "$ROOT_DIR/tests/cross-impl/requirements.txt"

echo ""
echo "==> Bootstrap completed successfully"
echo "Next steps:"
echo "  1) bash test.sh"
echo "  2) npx @eep-dev/compliance-cli --target <url> --api-key <key> --entity <entity> --level full --report-json ./eep-audit-report.json --report-md ./eep-audit-report.md"
