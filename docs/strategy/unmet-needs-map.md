# Unmet needs in the agent ecosystem → EEP mapping (v0.1)

**Purpose:** Align external pain points (industry and research in 2025–2026) with what EEP **already ships** so marketing and docs stay **evidence-based**. This is not a normative spec; the spec is [SPECIFICATION.md](../current/SPECIFICATION.md).

## How to read this table

- **Pain:** Observed or widely discussed friction (MCP, agent tooling, API integration, identity).
- **EEP today:** Concrete capability in the repo; link to spec section or package where useful.
- **Headline:** Short phrase for one-pagers; must not overclaim (no guaranteed traffic/ranking).

| Pain / gap | EEP today | Headline (accurate) |
|------------|------------|---------------------|
| **Request-only tool plumbing**; push/events for MCP still emerging (e.g. Triggers & Events WG) | Layer 2: SSE + webhooks, CloudEvents-shaped envelopes, `Last-Event-ID` / replay | Push subscription + delivery—documented, not a charter-only |
| **Identity and authorization** at the tool boundary; OWASP-style MCP top risks | DIDs, HMAC for deliveries, `EEP-Agent-DID` / `EEP-Signature` on gated calls, VC support in spec tiers | Attributable, verifiable engagement—not anonymous tool fire-hose |
| **No standard “agent pays or proves access”** for APIs | Gates: payment, credential, identity, agreement, `data_request`, combined; HTTP **402** patterns in [`@eep-dev/gates`](../../packages/@eep-dev/gates/) | 402 and proofs as first-class, not ad hoc |
| **Everyone reinvents** webhook signing, replay windows, subscriber URL safety | [`@eep-dev/signer`](../../packages/@eep-dev/signer/), [`@eep-dev/validator`](../../packages/@eep-dev/validator/) (incl. SSRF checks) | Standard Webhooks–aligned building blocks |
| **Context bloat** from “unified” APIs and fat JSON | Content negotiation and subscription filters in spec; per-event-type subscription | Subscribers choose **what** and **when** |
| **“Does this deployment actually work?”** | [`@eep-dev/compliance-cli`](../../packages/@eep-dev/compliance-cli/) with JSON/Markdown/HTML reports | Conformance you can run in CI |
| **LLMs hallucinate without curated context** | [llms.txt](../../llms.txt), [llms-full.txt](../../llms-full.txt), [AGENTS.md](../../AGENTS.md) | Curated, agent-readable corpus |
| **MCP vs A2A vs ANP confusion** | [README.md](../../README.md) matrix, [eep-positioning-complementary.md](../guides/eep-positioning-complementary.md) | EEP **next to** MCP, not a replacement |

## Gaps EEP does **not** claim to close alone

- **MCP tool catalog / IDE marketplace discovery** — use MCP registries and directories; EEP’s **MCP bridge** is one integration path.
- **End-user messaging UX** (WhatsApp, Slack, etc.) — out of scope for the protocol; harness-specific (e.g. OpenClaw).
- **Guaranteed search/GEO outcomes** — see README disclaimer; GEO is informative context, not a conformance test.

## Maintenance

When the spec or packages change, update the **EEP today** column and this file in the same PR.
