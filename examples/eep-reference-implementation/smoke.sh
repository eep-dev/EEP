#!/usr/bin/env bash
set -euo pipefail

NODE_BASE="${NODE_BASE:-http://localhost:3100}"
PY_BASE="${PY_BASE:-http://localhost:3200}"

echo "== Node health =="
curl -fsS "${NODE_BASE}/healthz" | tee /tmp/eep-node-health.json >/dev/null

echo "== Python health =="
curl -fsS "${PY_BASE}/healthz" | tee /tmp/eep-py-health.json >/dev/null

echo "== Node discovery =="
curl -fsS "${NODE_BASE}/.well-known/eep.json" >/dev/null

echo "== Python discovery =="
curl -fsS "${PY_BASE}/.well-known/eep.json" >/dev/null

echo "== Node subscribe + gated content =="
curl -fsS -X POST "${NODE_BASE}/eep/subscribe" -H "content-type: application/json" -d '{"source_did":"did:web:test","delivery_method":"sse"}' >/dev/null
node_denied="$(curl -s -o /dev/null -w "%{http_code}" "${NODE_BASE}/eep/content/did:web:test/content.papers.full_text")"
node_allowed="$(curl -s -o /dev/null -w "%{http_code}" "${NODE_BASE}/eep/content/did:web:test/content.papers.full_text" -H 'x-eep-gate-proofs: [{"type":"payment","token":"x402"}]')"
test "${node_denied}" = "402"
test "${node_allowed}" = "200"

echo "== Python subscribe + gated content =="
curl -fsS -X POST "${PY_BASE}/eep/subscribe" -H "content-type: application/json" -d '{"source_did":"did:web:test","delivery_method":"sse"}' >/dev/null
py_denied="$(curl -s -o /dev/null -w "%{http_code}" "${PY_BASE}/eep/content/did:web:test/content.papers.full_text")"
py_allowed="$(curl -s -o /dev/null -w "%{http_code}" "${PY_BASE}/eep/content/did:web:test/content.papers.full_text" -H 'x-eep-gate-proofs: [{"type":"payment","token":"x402"}]')"
test "${py_denied}" = "402"
test "${py_allowed}" = "200"

echo "Smoke checks passed."
