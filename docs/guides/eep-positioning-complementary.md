# EEP positioning: complementary protocols

EEP standardizes **entity-centric engagement**: discovery, realtime entity streams (SSE/webhook), policy-aware gating, and machine-readable commerce signals where enabled.

It is **not** a replacement for:

| Protocol | Role | Relationship to EEP |
|----------|------|---------------------|
| **MCP** | Tool/resource invocation for model runtimes | Complementary — MCP wraps tools; EEP publishes entity lifecycle/events your platform exposes to subscribers. |
| **A2A** | Agent-to-agent task collaboration | Complementary — EEP can notify subscribers when entity state relevant to tasks changes; A2A handles delegation flows. |
| **ANP** | Decentralized agent networking | Complementary — EEP’s discovery and DID usage can align with agent network identity patterns. |

**One-sentence pitch:** *MCP connects agents to tools; EEP connects subscribers to entity state changes with standard discovery and delivery semantics.*