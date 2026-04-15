# LangGraph/Claude + EEP Integration Guide

This guide walks through building an AI agent (using [LangGraph](https://github.com/langchain-ai/langgraph) and Claude) that interacts with EEP publishers: discovering entities, subscribing to event streams, handling gate challenges, and processing events through an LLM pipeline.

## Why LangGraph + EEP?

LangGraph provides a graph-based orchestration framework for LLM agents. EEP provides the event infrastructure those agents consume. Together, they enable agents that react to real-time entity state changes with structured reasoning.

| Concern | Handled by |
|---------|-----------|
| Entity discovery, subscription, delivery | EEP (Layer 1 + Layer 2) |
| Gate proofs (auth, payment, agreements) | `eep-gates-python` |
| Webhook signature verification | `eep-signer-python` |
| Event envelope validation | `eep-validator-python` |
| Event reasoning, summarization, actions | LangGraph + Claude |

## Architecture

```
Publisher ──Layer 2 webhook──▶ Agent webhook server
                                      │
                              ┌───────┴───────┐
                              │  LangGraph    │
                              │  ┌──────────┐ │
                              │  │ validate  │ │  ← CloudEvents + EEP checks
                              │  │ verify    │ │  ← HMAC-SHA256
                              │  │ summarize │ │  ← Claude (langchain-anthropic)
                              │  │ act       │ │  ← route by event type
                              │  └──────────┘ │
                              └───────────────┘
```

## Quick start

```bash
cd EEP/examples/langgraph-eep-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export EEP_TARGET=http://localhost:3100   # reference impl or realworld-simulation
export ANTHROPIC_API_KEY=sk-ant-...

python agent.py
```

The agent will:
1. `GET /u/acme-corp` to discover the entity and its `Link: rel="subscribe"` URL.
2. `POST /eep/subscribe` with a webhook delivery URL pointing to the local server.
3. Wait for incoming events and process each through the validate/summarize/act pipeline.

## Gate handling

When the agent encounters a gated resource:

- **402 Payment Required**: reads `gate_type` and payment requirements, constructs a proof (x402 or tx hash), retries.
- **403 Agreement Required**: fetches the agreement, signs its hash with the agent DID key, retries.
- **403 Credential Required**: presents a Verifiable Presentation from the agent's credential store.

These flows use the `eep_gates` Python package. See [Agent Wallet Guide](./AGENT-WALLET-GUIDE.md) for wallet and spending policy configuration.

## Event processing pipeline

Each webhook event flows through three nodes:

1. **validate**: checks CloudEvents required fields (`specversion`, `id`, `source`, `type`, `time`) and EEP extensions (`eep_version`).
2. **summarize**: sends the event to Claude for a one-sentence summary (falls back to a template if no API key).
3. **act**: routes by event type suffix to an action (`alert:trust_change`, `revoke_local_session`, `sync_entity_cache`, `record_payment`, etc.).

## Extending the agent

- Add nodes for MCP tool calls via `eep-mcp-bridge-python` (see [MCP-EEP Bridge Guide](./EEP-MCP-BRIDGE.md)).
- Add Layer 3 WebSocket negotiation for commerce disputes.
- Use LangGraph's `StateGraph` for more complex routing (conditional edges, parallel branches).

## Related resources

- [Example code](../../examples/langgraph-eep-agent/)
- [EEP Specification](../current/SPECIFICATION.md)
- [Agent Onboarding Guide](./agent-onboarding.md)
- [MCP-EEP Bridge Guide](./EEP-MCP-BRIDGE.md)
- [Realworld Simulation](./realworld-simulation.md)
- [Interactive Playground](https://eep.dev/playground) (validate events and signatures in the browser)
