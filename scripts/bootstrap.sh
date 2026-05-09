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
echo "==> Setting up Python virtual environment"
(test -d "$ROOT_DIR/.venv" || python3 -m venv "$ROOT_DIR/.venv")

echo "==> Installing Python test dependencies"
"$ROOT_DIR/.venv/bin/python" -m pip install --upgrade pip
"$ROOT_DIR/.venv/bin/pip" install \
  pytest \
  pytest-asyncio \
  pydantic \
  httpx \
  pip-audit

echo " -> cross-impl requirements"
"$ROOT_DIR/.venv/bin/pip" install -r "$ROOT_DIR/tests/cross-impl/requirements.txt"

echo ""
echo "==> Bootstrap completed successfully"
echo "Next steps:"
echo "  1) bash test.sh"
echo "  2) npx @eep-dev/compliance-cli --target <url> --api-key <key> --entity <entity> --level full --report-json ./eep-audit-report.json --report-md ./eep-audit-report.md"
