#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "═══════════════════════════════════════════════════════"
echo "  EEP — Full Test Suite (TRL-8)"
echo "═══════════════════════════════════════════════════════"

echo ""
echo "━━━ Schema Validation & Benchmarks ━━━"
(cd "$ROOT_DIR/tests" && npm ci --silent && npx vitest run)

echo ""
echo "━━━ @eep-dev/validator ━━━"
(cd "$ROOT_DIR/packages/@eep-dev/validator" && bash test.sh)

echo ""
echo "━━━ @eep-dev/signer ━━━"
(cd "$ROOT_DIR/packages/@eep-dev/signer" && bash test.sh)

echo ""
echo "━━━ @eep-dev/gates ━━━"
(cd "$ROOT_DIR/packages/@eep-dev/gates" && npm ci && npm run build && bash test.sh)

echo ""
echo "━━━ @eep-dev/compliance-cli ━━━"
(cd "$ROOT_DIR/packages/@eep-dev/compliance-cli" && bash test.sh)

echo ""
echo "━━━ @eep-dev/discovery ━━━"
(cd "$ROOT_DIR/packages/@eep-dev/discovery" && npm install && npx vitest run)

echo ""
echo "━━━ Python: eep-signer ━━━"
(cd "$ROOT_DIR/packages/eep-signer-python" && PYTHONPATH=. python3 -m pytest tests/ -v)

echo ""
echo "━━━ Python: eep-validator ━━━"
(cd "$ROOT_DIR/packages/eep-validator-python" && PYTHONPATH=. python3 -m pytest tests/ -v)

echo ""
echo "━━━ Python: eep-gates ━━━"
(cd "$ROOT_DIR/packages/eep-gates-python" && pip install -e '.[dev]' -q && PYTHONPATH=. python3 -m pytest tests/ -q --no-header --no-summary)

echo ""
echo "━━━ Python: eep-compliance-cli ━━━"
(cd "$ROOT_DIR/packages/eep-compliance-cli-python" && PYTHONPATH=. python3 -m pytest tests/ -v)

echo ""
echo "━━━ Python: eep-discovery ━━━"
(cd "$ROOT_DIR/packages/eep-discovery-python" && PYTHONPATH=. python3 -m pytest tests/ -v)

echo ""
echo "━━━ Python: eep-mcp-bridge ━━━"
(cd "$ROOT_DIR/packages/eep-mcp-bridge-python" && pip install -e '.[dev]' -q && PYTHONPATH=. python3 -m pytest tests/ -q --no-header --no-summary)

echo ""
echo "━━━ Python: eep-middleware ━━━"
(cd "$ROOT_DIR/packages/eep-middleware-python" && pip install -e '.[dev]' -q && python3 -m pytest -q)

echo ""
echo "━━━ llms.txt / llms-full.txt ━━━"
python3 "$ROOT_DIR/scripts/verify-llms-docs.py"

echo ""
echo "━━━ Cross-implementation protocol tests ━━━"
echo "  NOTE: Requires a running publisher endpoint (set EEP_BASE_URL if not localhost:3002)"
(cd "$ROOT_DIR" && pip install -r tests/cross-impl/requirements.txt && EEP_BASE_URL="${EEP_BASE_URL:-http://localhost:3002}" python3 -m pytest tests/cross-impl -v)

echo ""
echo "  ALL EEP TESTS PASSED (TS + Python + schema + cross-impl)"
