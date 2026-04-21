# `integrations/`

Entry points for tools that are not the EEP monorepo: Cursor rules, a Claude Code–style `SKILL.md`, and copy-paste notes for OpenClaw-style harnesses. Everything here ends up running [`@eep-dev/agent-adopt`](../packages/@eep-dev/agent-adopt/) and/or reading [AGENTS.md](../AGENTS.md).

| Path | What it is |
|------|------------|
| `cursor-rule/` | Cursor rule when someone wants EEP in the repo they have open |
| `claude-code-skill/` | `SKILL.md` + a short `references/` note on EEP vs MCP |
| `openclaw-bundle/` | How to call `npx @eep-dev/agent-adopt` from a bundle or shell hook |

We do not ship vendor SDKs in this tree. If you list something on a third-party directory, do that from your own release process ([distribution checklist](../docs/strategy/distribution-checklist-d0.md)).
