# EEP agent-adoption strategy (source of truth)

**Version:** 0.1 (living document)  
**Audience:** EEP maintainers, partners, and agent-harness tool developers.

## Goal

Make EEP the default way **AI coding agents** (and personal-assistant harnesses like OpenClaw) onboard **push, identity, and gate-aware** surfaces into an existing app—without a human reading the full specification first. Success is measured by:

- A stranger can run the adoption flow in **&lt; 5 minutes** on a clean machine.
- `verify` (artifacts) and **Core/Standard** compliance checks pass against a reference or staging deployment when configured.
- Third-party issues/PRs reference **`AGENTS.md`** or `EEP_ADOPTION_REPORT.md` within the first months after launch.

## One-sentence positioning

**MCP is how an agent calls a tool. EEP is how an agent subscribes to an entity, verifies who sent an event, and negotiates access (including payment)—using documented wire formats and shipped libraries.**

EEP is **complementary** to MCP, A2A, and ANP. See [eep-positioning-complementary.md](../guides/eep-positioning-complementary.md).

## Why agents (not only enterprises)

Enterprises move on procurement, security review, and roadmaps. Agent harness users (Claude Code, Cursor, Cline, OpenClaw, etc.) can **fork, wire, and PR** the same day if:

1. The repo has **`llms.txt`**, **`llms-full.txt`**, and **`AGENTS.md`** (machine-readable “what to do next”).
2. A single CLI (**`@eep-dev/agent-adopt`**) chains **`eep-setup` inject → apply → verify** and writes **`EEP_ADOPTION_REPORT.md`**.
3. Optional: **`@eep-dev/compliance-cli`** against a live **base URL** for proof (needs API key, entity, and a reachable webhook target for full subscription tests).

## Target personas (priority)

1. **OpenClaw** (and similar) power users: MCP client/server, Plugin Bundles, `HOOK.md` workflows—ship a thin **bundle** that points at `agent-adopt` + docs.
2. **Claude Code** / **Cursor** developers: `AGENTS.md` + rules/skills that delegate to the same runbook.
3. **Cline / Aider / Roo / OpenCode**: open-protocol bias; cred through conformance reports and small PRs.
4. **Enterprise MCP gateways**: position EEP as the **event + identity** layer in front of or beside MCP—no replacement story.

## What we ship today (no vaporware)

| Capability | Where |
|------------|--------|
| Normative spec + schemas | [SPECIFICATION.md](../current/SPECIFICATION.md), [schemas/v0.1/](../../schemas/v0.1/) |
| TS + Python libraries | [packages/](../../packages/) |
| Setup wizard | [`@eep-dev/setup-cli`](../../packages/@eep-dev/setup-cli/) |
| Conformance runner | [`@eep-dev/compliance-cli`](../../packages/@eep-dev/compliance-cli/) |
| HTTP middleware | [`@eep-dev/middleware`](../../packages/@eep-dev/middleware/), Python parity |
| MCP bridge (tool runtime ↔ EEP) | [`@eep-dev/mcp-bridge`](../../packages/@eep-dev/mcp-bridge/) |
| Agent-oriented doc bundle | [llms.txt](../../llms.txt), [llms-full.txt](../../llms-full.txt) |
| One-shot adoption wrapper | [`@eep-dev/agent-adopt`](../../packages/@eep-dev/agent-adopt/) |

## Honest limits (v0.1)

- **`setup-cli` inject** still requires **application wiring** for real traffic; we ship **optional framework patchers** (Express, FastAPI) that generate a wiring module and best-effort entry-point hooks. Integrators should follow [integrate-eep-after-setup-cli.md](../guides/integrate-eep-after-setup-cli.md) for production.
- **Full**-tier **compliance-cli** coverage is **partial** by design; see the compliance CLI README.
- A **public registry of adopters** is **static JSON** plus the landing site—no hosted marketplace.

## Distribution and community

See [launch-playbook-d0.md](./launch-playbook-d0.md) and [unmet-needs-map.md](./unmet-needs-map.md). The **day-0 distribution checklist** in [distribution-checklist-d0.md](./distribution-checklist-d0.md) is updated as submissions land.

## Related documents

- [unmet-needs-map.md](./unmet-needs-map.md) — market pain → EEP mapping  
- [launch-playbook-d0.md](./launch-playbook-d0.md) — content sequence and channel plan  
- [registry-seed.md](./registry-seed.md) — first adopters and JSON shape  
- [screencast-runbook-d0.md](./screencast-runbook-d0.md) — ≤60s demo script and repro steps
