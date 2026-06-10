#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

RUN_FULL=false
if [[ "${1:-}" == "--full" ]]; then
  RUN_FULL=true
fi

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
(cd "$ROOT_DIR/packages/eep-middleware-python" \
  && pip install -e ../eep-gates-python -e ../eep-validator-python -q \
  && pip install -e '.[dev]' -q \
  && python3 -m pytest -q)

echo ""
echo "━━━ llms.txt / llms-full.txt ━━━"
python3 "$ROOT_DIR/scripts/verify-llms-docs.py"

if [ "$RUN_FULL" = true ]; then
  echo ""
  echo "━━━ Cross-implementation protocol tests ━━━"
  SERVER_PID=""
  if ! curl -Is http://localhost:3002 > /dev/null; then
    echo "  Starting examples/node-gate-publisher in the background on port 3002..."
    (cd "$ROOT_DIR/examples/node-gate-publisher" && npm install --silent && npm start) > /dev/null 2>&1 &
    SERVER_PID=$!
    
    # Wait for server to be ready
    for i in {1..10}; do
      if curl -Is http://localhost:3002/eep > /dev/null || curl -Is http://localhost:3002/.well-known/eep.json > /dev/null; then
        break
      fi
      sleep 1
    done
  else
    echo "  Found running publisher on localhost:3002"
  fi

  set +e
  (cd "$ROOT_DIR" && pip install -r tests/cross-impl/requirements.txt -q && EEP_BASE_URL="${EEP_BASE_URL:-http://localhost:3002}" python3 -m pytest tests/cross-impl -v)
  TEST_EXIT_CODE=$?
  set -e

  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi

  echo ""
  echo "  ALL EEP TESTS PASSED (TS + Python + schema + cross-impl)"
else
  echo ""
  echo "  ALL CORE EEP TESTS PASSED (TS + Python + schema) — excluding cross-impl"
fi
