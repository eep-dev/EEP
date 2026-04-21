# OpenClaw / similar: call `agent-adopt` from your harness

Point your app repo at the same command a human would run from the project root. No separate binary in this repo.

## Command

```bash
cd /path/to/your-api
npx @eep-dev/agent-adopt --project . --no-compliance
```

If a real base URL exists (and you have a key and entity path for that deployment):

```bash
npx @eep-dev/agent-adopt --project . \
  --compliance-target https://api.example.com \
  --compliance-api-key "$KEY" \
  --compliance-entity u/acme
```

## How this maps to OpenClaw-style setups

- OpenClaw can use MCP; EEP’s own [`@eep-dev/mcp-bridge`](https://github.com/eep-dev/EEP/tree/main/packages/%40eep-dev/mcp-bridge) is a different layer (tool-shaped calls vs entity streams). Use both if you need both.
- In a **Plugin Bundle** or **skill**, set `cwd` to the user’s app directory and run the `npx` line above.
- In a **HOOK**-style step, run the same shell command; show the user `EEP_ADOPTION_REPORT.md` when it lands.

**Docs:** [AGENTS.md](https://github.com/eep-dev/EEP/blob/main/AGENTS.md) · [launch-playbook](https://github.com/eep-dev/EEP/blob/main/docs/strategy/launch-playbook-d0.md) · [distribution checklist](https://github.com/eep-dev/EEP/blob/main/docs/strategy/distribution-checklist-d0.md) (for listing your bundle elsewhere, when you publish it).
