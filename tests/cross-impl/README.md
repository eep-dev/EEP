# Cross-Implementation EEP Test Suite

Language-agnostic protocol-level tests that verify any EEP gate publisher, regardless of implementation language.

## Setup

```bash
pip install -r requirements.txt
```

## Run

Start your EEP publisher, then:

```bash
# Against the Node.js gate publisher example
EEP_BASE_URL=http://localhost:3002 pytest -v

# Against a Python publisher
EEP_BASE_URL=http://localhost:8000 pytest -v
```

## What's tested

| Test file | Endpoint | Checks |
|-----------|----------|--------|
| `test_gate_config_endpoint.py` | `GET /eep/gates/:did` | Gate config structure, tiers, access patterns |
| `test_gated_resource.py` | `GET /eep/content/:did/:path` | 402 responses, unmet requirements, proof-based access |
| `test_gated_subscription.py` | `POST /eep/subscribe` | Default tier, gated tier 402, proof-based subscription |
| `test_service_catalog.py` | `GET /eep/services/:did` | Catalog structure, service fields, pricing, unique IDs |

## Adding tests

To test a custom publisher, set `EEP_BASE_URL` and run. The tests are designed to be tolerant of different configurations while verifying protocol compliance.
