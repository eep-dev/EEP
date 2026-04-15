# LangGraph + EEP Agent Example

> A LangGraph agent that subscribes to EEP entity streams, handles gates (auth/payment/agreement), and processes events using Claude.

## What this demonstrates

1. **Discovery**: Agent resolves an entity via Layer 1 REST, reads `Link` headers and `/.well-known/eep.json`.
2. **Subscription**: Agent subscribes to entity events via `POST /eep/subscribe` (Layer 2 webhook delivery).
3. **Gate handling**: When the agent hits a 402 (payment) or 403 (credential/agreement), it uses `eep-gates-python` to construct and submit gate proofs.
4. **Event processing**: Incoming webhook events are validated with `eep-validator-python`, signature-checked with `eep-signer-python`, and routed to a LangGraph processing graph.
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

When the agent encounters a gated resource:

- **402 Payment Required**: The agent reads the `gate_type` and payment requirements from the response body, constructs a payment proof (x402 or on-chain hash), and retries with `gate_proofs` in the request.
- **403 Forbidden (credential)**: The agent presents a Verifiable Presentation from its credential store.
- **403 Forbidden (agreement)**: The agent fetches the agreement document, computes its hash, signs it with the agent DID private key, and retries.

These flows use `eep_gates.proof_validator` and `eep_gates.access_resolver` from the `eep-gates-python` package.

## Related

- [EEP Specification](../../docs/current/SPECIFICATION.md)
- [MCP-EEP Bridge Guide](../../docs/guides/EEP-MCP-BRIDGE.md)
- [Agent Onboarding Guide](../../docs/guides/agent-onboarding.md)
- [Realworld Simulation](../../realworld-simulation/)
