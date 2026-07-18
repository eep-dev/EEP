# LangGraph + EEP Agent Example

> A LangGraph agent that subscribes to EEP entity streams, handles gates (auth/payment/agreement), and processes events using Claude.

## What this demonstrates

1. **Discovery**: Agent resolves an entity via Layer 1 REST, reads `Link` headers and `/.well-known/eep.json`.
2. **Subscription**: Agent subscribes to entity events via `POST /eep/subscribe` (Layer 2 webhook delivery).
3. **Gate handling**: When the agent hits a `402 access_restricted` or `403 access_forbidden` response, it parses the canonical `unmet_requirements[]` (each carries a machine-readable `resolution_hint`) and constructs a matching gate proof **per requirement** — no LLM needed to decide what to do.
4. **Event processing**: Incoming webhook events are validated against the CloudEvents envelope and signature-checked with a Standard Webhooks HMAC verifier (the algorithm in `eep-signer`), then routed to a LangGraph processing graph.

> This example implements the EEP wire contracts (canonical gate response, Standard Webhooks HMAC) **inline** so it reads as a single self-contained file. In production, import [`eep-gates`](../../packages/eep-gates-python/), [`eep-signer`](../../packages/eep-signer-python/), and [`eep-validator`](../../packages/eep-validator-python/) instead of re-implementing them.
5. **Claude reasoning**: Each event is summarized and acted on by Claude (via `langchain-anthropic`).

## Architecture

```
EEP Publisher
    │
    ├─ Layer 1 (GET /u/acme-corp) → discovery + gate requirements
    ├─ Layer 2 (POST /eep/subscribe) → webhook subscription
    │
    └─ Webhook delivery ──────┐
                              ▼
                    ┌─────────────────┐
                    │  LangGraph Agent │
                    │  ┌─────────────┐ │
                    │  │ validate    │ │  ← eep-validator-python
                    │  │ verify sig  │ │  ← eep-signer-python
                    │  │ gate check  │ │  ← eep-gates-python
                    │  │ Claude LLM  │ │  ← langchain-anthropic
                    │  │ act/respond │ │
                    │  └─────────────┘ │
                    └─────────────────┘
```

## Prerequisites

- Python 3.11+
- An `ANTHROPIC_API_KEY` environment variable
- A running EEP publisher (use the [reference implementation](../eep-reference-implementation/) or the [realworld simulation](../../realworld-simulation/))

## Quick start

```bash
cd EEP/examples/langgraph-eep-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Point at a running EEP publisher
export EEP_TARGET=http://localhost:3100
export ANTHROPIC_API_KEY=sk-ant-...

python agent.py
```

## Files

| File | Purpose |
|------|---------|
| `agent.py` | LangGraph graph definition, EEP subscription, webhook server, Claude processing |
| `requirements.txt` | Python dependencies |

## How gate handling works

Both `402 access_restricted` and `403 access_forbidden` use the same canonical
body (`gate.402-response.json` / `gate.403-response.json`):

```json
{
  "error": "access_restricted",
  "resource": "content.papers.full_text",
  "current_tier": "free",
  "required_tier": "paid",
  "unmet_requirements": [
    { "type": "payment", "amount": 0.1, "currency": "USD", "per": "request",
      "resolution_hint": "Pay $0.10 via the payment_methods URL" }
  ]
}
```

`handle_gate_challenge()` iterates `unmet_requirements` and builds one proof per
entry, routed on each requirement's `type` (`payment` → `token`, `credential` →
a VC in the accepted format, `agreement` → a signature over `document_hash`,
`identity`/`trust`/`connection`, …). Every requirement carries a
`resolution_hint`, so the agent decides what to satisfy **without** an LLM call.
Requirement types the demo cannot auto-satisfy (e.g. custom `x-*`) are skipped.

`test_agent.py` asserts this parsing against the canonical shapes (run
`python -m pytest test_agent.py`).

## Related

- [EEP Specification](../../docs/current/SPECIFICATION.md)
- [MCP-EEP Bridge Guide](../../docs/guides/EEP-MCP-BRIDGE.md)
- [Agent Onboarding Guide](../../docs/guides/agent-onboarding.md)
- [Realworld Simulation](../../realworld-simulation/)
