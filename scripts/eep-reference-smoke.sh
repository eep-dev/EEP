#!/usr/bin/env bash
# Smoke-test a running EEP reference or local API (defaults: reference Node port 3100).
set -euo pipefail

BASE_URL="${EEP_SMOKE_BASE_URL:-http://127.0.0.1:3100}"

echo "EEP smoke: BASE_URL=${BASE_URL}" >&2

curl -fsS "${BASE_URL}/healthz" >/dev/null
curl -fsS "${BASE_URL}/.well-known/eep.json" >/dev/null
curl -fsS "${BASE_URL}/eep/gates" >/dev/null
curl -fsS "${BASE_URL}/eep/services" >/dev/null
curl -fsS --max-time 3 "${BASE_URL}/eep/stream" >/dev/null || true

echo "OK: core endpoints reachable" >&2
