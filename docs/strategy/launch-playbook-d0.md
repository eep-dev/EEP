# Day-0 launch playbook (EEP public drop)

**Goal:** Build **discoverability** and **reproducible first-run** before scaling community. All items are **checkable**; owners and dates are filled in by the release manager.

## Preconditions

- [ ] [AGENTS.md](../../AGENTS.md) present at repo root; links to [llms-full.txt](../../llms-full.txt) and `agent-adopt`.
- [ ] Reference stack or staging URL passes **Core/Standard** compliance when exercised (see [TESTING.md](../../TESTING.md)).
- [ ] Spec and tooling aligned on **webhook** signature header naming ([SPECIFICATION.md](../current/SPECIFICATION.md) §5, §14).
- [ ] [registry-seed.md](./registry-seed.md) and [../registry/adopters.json](../../registry/adopters.json) have at least **five** honest seed entries (examples/reference count).

## Content sequence (suggested: one asset per week)

| Week | Asset | Channel |
|------|--------|--------|
| 1 | Landing copy: EEP as **push + identity + gates** next to MCP | eep-site home / docs lead |
| 2 | Blog + **≤60s screencast** using [screencast-runbook-d0.md](./screencast-runbook-d0.md) | Blog, YouTube, X |
| 3 | Deep-dive: **402 / gates / proofs** for agent-shaped clients | dev.to, technical post |
| 4 | Comparison: MCP, A2A, ANP, EEP (link positioning doc) | HN, Reddit, newsletter |

## Community seed (suggested)

- HN Show, `r/mcp`, `r/ClaudeAI`, `r/selfhosted` (OpenClaw angle), `r/LocalLLaMA where relevant
- Changelog and **release notes** with exact npm package versions

## Alliances (non-blocking)

- OpenClaw / Plugin Bundle catalog maintainers (when bundle PR is ready)
- Standard Webhooks, CloudEvents, DID communities (factual interop, not pay-to-play)
- Gateway vendors (Composio, Nango, etc.) for **architecture diagrams** only—no partnership claims without contracts

## Success criteria (launch window)

- Screencast **reproducible** on a clean macOS/Linux box per runbook.  
- **≥ 3** external directory/listing **acceptances** (track in [distribution-checklist-d0.md](./distribution-checklist-d0.md)).  
- **≥ 1** third-party issue/PR mentioning **AGENTS.md** or **EEP** integration (qualitative).

## See also

- [distribution-checklist-d0.md](./distribution-checklist-d0.md) — where to submit the MCP bridge and related artifacts  
- [screencast-runbook-d0.md](./screencast-runbook-d0.md) — demo script
