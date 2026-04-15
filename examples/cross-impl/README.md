# EEP Cross-Implementation Interoperability Tests (Legacy)

This directory contains an older interoperability test setup kept for historical reference.

For the current and actively maintained suite, use:

- `tests/cross-impl/README.md`
- Root CI job: `test-cross-impl` in `.github/workflows/test.yml`

The legacy suite here originally verified that:

1. A **Node.js publisher** (Express) can communicate correctly with a **Python subscriber** (FastAPI)
2. A **Python publisher** can communicate correctly with a **Node.js subscriber**
3. Event envelope format, HMAC signatures, and CloudEvents schema are compatible across language implementations

## Prerequisites

```bash
# Node.js packages
npm install -g ts-node
pip install httpx pytest fastapi uvicorn

# Or use Docker Compose (recommended):
docker compose up
```

## Running the tests

```bash
# Option 1: Shell script (local)
bash test-interop.sh

# Option 2: Python pytest (requires both servers running)
pytest test_cross_impl.py -v

# Option 3: Docker Compose (fully self-contained)
docker compose run --rm test
```

## Test coverage

The following 8 scenarios are verified: SSE cross-lang, Webhook + HMAC cross-lang, WebSocket commerce cross-lang, reverse-direction SSE and Webhook, manifest schema, CloudEvents envelope, and gate proof Verifiable Presentation:

| Test | Publisher | Subscriber | Protocol Layer |
|---|---|---|---|
| `test_sse_cross_lang` | Node.js | Python | Layer 2 SSE |
| `test_webhook_cross_lang` | Node.js | Python | Layer 2 Webhook + HMAC |
| `test_ws_commerce_cross_lang` | Node.js | Python | Layer 3 WebSocket commerce |
| `test_sse_cross_lang_reverse` | Python | Node.js | Layer 2 SSE |
| `test_webhook_cross_lang_reverse` | Python | Node.js | Layer 2 Webhook + HMAC |
| `test_manifest_schema_compat` | Both | Both | `/.well-known/eep.json` |
| `test_cloudevents_envelope_compat` | Both | Both | CloudEvents v1.0 envelope |
| `test_gate_proof_compat` | Both | Both | Gate proof cross-lang Verifiable Presentation |

## Architecture

```
┌─────────────────────────────┐       ┌────────────────────────────────┐
│   Node.js EEP Publisher     │──SSE──▶   Python EEP Subscriber        │
│   (examples/node-gate-      │       │   (examples/python-fastapi-    │
│    publisher)               │◀──WH──│    subscriber)                 │
└─────────────────────────────┘       └────────────────────────────────┘
        ▲ ▼ (reverse direction)                ▲ ▼
┌─────────────────────────────┐       ┌────────────────────────────────┐
│   Python EEP Publisher      │──SSE──▶   Node.js EEP Subscriber       │
│   (examples/python-gate-    │       │   (examples/node-express-      │
│    subscriber acting as     │◀──WH──│    subscriber)                 │
│    publisher for reversal)  │       └────────────────────────────────┘
└─────────────────────────────┘
```

## What "passing" means

A cross-impl test is considered passing when:

1. The subscriber receives the event within the timeout (default: 5s)
2. The CloudEvents envelope validates against `event.envelope.json`
3. The HMAC-SHA256 signature on the delivery payload verifies correctly
4. The `eep_subscription_id` and `eep_delivery_id` are present
5. The `Content-Type: application/json` header is present on all deliveries
6. The event `type` matches what was emitted by the publisher

## CI integration

This legacy suite is not the primary CI target anymore. Use `tests/cross-impl` for release gating.
