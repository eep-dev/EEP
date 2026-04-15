# Testing and validating your EEP implementation

> This guide explains how to test any platform's conformance with the EEP specification using the `@eep-dev/compliance-cli`.

---

## Quick start

```bash
npx @eep-dev/compliance-cli --target https://api.yourplatform.com --api-key YOUR_KEY --entity u/your-entity
```

For automated scoring/reporting:

```bash
npx @eep-dev/compliance-cli \
  --target https://api.yourplatform.com \
  --api-key YOUR_KEY \
  --entity u/your-entity \
  --level full \
  --report-json ./eep-audit-report.json \
  --report-md ./eep-audit-report.md
```

The CLI starts a temporary local HTTP server, triggers test events, and checks for:
- EEP endpoint discovery via HTTP `Link` headers
- Subscription creation and WebSub intent verification
- Webhook delivery within 5 seconds
- HMAC-SHA256 signature correctness
- CloudEvents v1.0 envelope format
- EEP extension attributes

It also prints a normalized audit score and can emit machine-readable findings for remediation workflows.

After the main conformance blocks, the CLI runs an additional **v0.1 reference capabilities** section (always best-effort):

- `GET /.well-known/eep-registry.json` — checks for an `economics` object (registration fee, query quota, or staking/challenge fields).
- `GET /eep/trust-status?agent_did=…` — cold-start trust state probe.
- `POST /eep/delegation/verify` — delegation privacy binding probe.

These endpoints are optional on production platforms; reference stacks (`examples/eep-reference-implementation`) implement them for demos. Use `--report-json` / `--report-md` to capture results.

### What the compliance CLI does **not** validate

The CLI exercises **wire behavior**, schemas, and selected policy probes. It does **not** assess:

- **Generative engine optimization (GEO)** outcomes, search or answer-engine ranking, or whether your content is cited in third-party LLM interfaces.
- **Legal or editorial semantics** inside licence documents (for example attribution wording); structural `agreement` gate checks do not replace counsel.
- **HTML / XML sitemap parity** with the EEP manifest, or general SEO quality.

For publisher strategy and GEO as *informative* context, see [`docs/WHITEPAPER.tex`](../WHITEPAPER.tex). For normative discovery requirements, see [`docs/current/SPECIFICATION.md`](../current/SPECIFICATION.md) §12.

---

## Conformance levels

Run with `--level core|standard|full` to test specific levels.

### Core (minimum EEP-compliant)
```bash
npx @eep-dev/compliance-cli --target https://api.yourplatform.com --level core
```
Tests: basic reachability, subscription creation, webhook delivery, and HMAC signing.

### Standard (recommended minimum for production)
```bash
npx @eep-dev/compliance-cli --target https://api.yourplatform.com --level standard
```
Tests: core features plus the SSE endpoint, `Last-Event-ID` replay, rate limit headers, credential/identity/payment gates, and EEP version negotiation.

### Full (commerce, advanced gates + marketplace)

> **Note:** The compliance CLI provides **partial** automation for `--level full` (manifest + selected policy probes). Full-tier capabilities such as WebSocket commerce flows, PoI cryptographic validation, and sector-specific extensions still require manual validation.

Full adds advanced capabilities on top of Standard:
- Commerce messages over WebSocket follow the state machine
- Agreement and data_request gates are enforced
- Session persistence and W3C DPV compliance
- Service catalog endpoint returns valid `service.listing.json`
- Review submission and rating aggregation work correctly

---

## Manual testing checklist

### 1. Verify HMAC signing

Deliver a test webhook to yourself and verify the signature:

```bash
# Generate a test signature
node -e "
const { createHmac } = require('crypto');
const id = 'test-id';
const ts = Math.floor(Date.now()/1000).toString();
const body = JSON.stringify({ specversion: '1.0', id: '1', source: 'test', type: 'test.event', time: new Date().toISOString(), datacontenttype: 'application/json', data: {} });
const sig = createHmac('sha256', 'your_secret').update(id+'.'+ts+'.'+body).digest('base64');
console.log('webhook-signature: v1,' + sig);
"
```

### 2. Test WebSub verification manually

```bash
# Simulate the intent verification call
curl "https://your-webhook-url.com/hooks/eep?hub.mode=subscribe&hub.topic=did:web:...&hub.challenge=test123"
# Expected: response body should be exactly: test123
```

### 3. Test SSRF block

Your platform must block these URLs when subscribing:
```bash
# These should all return an error (not deliver events)
POST /eep/subscribe with delivery_url:
  - http://localhost:3000/hook
  - http://192.168.1.1/admin
  - http://169.254.169.254/latest/meta-data
  - http://10.0.0.1/internal
```

### 4. Test Last-Event-ID replay

```bash
# Connect to SSE, note the last event ID
curl -N "https://api.yourplatform.com/eep/stream?source=entity" \
  -H "Authorization: Bearer key"
# ... receive a few events, note their IDs, then close

# Reconnect with Last-Event-ID - should receive all events since that ID
curl -N "https://api.yourplatform.com/eep/stream?source=entity" \
  -H "Authorization: Bearer key" \
  -H "Last-Event-ID: {your_last_event_id}"
```

### 5. Test gate 402 response

```bash
# Request a gated resource without proofs — should return 402
curl -s https://api.yourplatform.com/eep/content/did:web:example.com:u:alice/content.papers.full_text | jq .

# Expected: { "error": "access_restricted", "resource": "...", "unmet_requirements": [...] }
```

### 6. Test gate config endpoint

```bash
# Should return valid gate configuration
curl -s https://api.yourplatform.com/eep/gates/did:web:example.com:u:alice | jq .

# Validate against schema
npx ajv validate -s schemas/v0.1/gate.config.json -d response.json
```

### 7. Test gated subscription

```bash
# Subscribe with a tier that requires proofs — should fail without proofs
curl -X POST https://api.yourplatform.com/eep/subscribe \
  -H "Content-Type: application/json" \
  -d '{ "source_did": "did:web:example.com:u:alice", "event_types": ["com.example.entity.*"], "delivery_method": "sse", "tier": "premium" }'

# Expected: 402 with unmet requirements
```

---

## CI integration

Add EEP compliance testing to your CI/CD pipeline:

```yaml
# .github/workflows/eep-compliance.yml (template for your own repository)
name: EEP Compliance Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start platform
        run: docker compose up -d
      - name: Run EEP compliance tests
        run: |
          npx @eep-dev/compliance-cli \
            --target http://localhost:3000 \
            --api-key ${{ secrets.TEST_API_KEY }} \
            --entity u/test-entity \
            --level standard
```

