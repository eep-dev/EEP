# EEP Protocol Positioning Matrix

EEP is a protocol standard focused on **agent-to-entity engagement**. It is not intended
to replace other protocols that solve different interoperability layers.

## Scope Matrix

| Protocol | Primary Scope | Pattern | Core Strength |
|---|---|---|---|
| **EEP** | Entity engagement | `agent <-> entity` | realtime entity signals, gate proofs, payment-aware access |
| **MCP** | Tool/resource invocation | `agent <-> tool` | portable tool-call and resource access contracts |
| **A2A** | Agent collaboration | `agent <-> agent` | inter-agent task delegation lifecycle |
| **ANP** | Decentralized agent networking | `agent <-> agent` | DID-centric decentralized agent network coordination |

## Recommended Composition

- Use EEP when the target is a digital entity profile, service provider, registry entry, or any stateful subject.
- Use MCP when the target is a callable tool server.
- Use A2A when one agent must delegate tasks to another agent.
- Use ANP where decentralized, DID-native multi-agent network coordination is required.

Most production stacks can combine these protocols:

- **EEP + MCP**: monetize and gate tool-backed entity capabilities.
- **EEP + A2A**: drive agent delegation from trusted entity events.
- **EEP + ANP**: preserve decentralized identity while streaming verified entity state.
