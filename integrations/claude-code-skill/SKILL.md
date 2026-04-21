---
name: eep-adopt-app
description: |
  User wants the Entity Engagement Protocol in their application—EEP, signed webhooks, SSE, gates,
  "agent-ready API," or running eep-dev/agent-adopt. Use for adopt EEP, add EEP, EEP webhooks, not for generic REST without EEP.
---

# Adopt EEP in an app repository

**When this triggers:** They ask to add EEP, entity streams, or run `agent-adopt` on a codebase.

**Not in scope here:** SEO/GEO promises, "ranking" claims, or replacing MCP. See `references/positioning.md` if they blur EEP and MCP.

## Flow

1. Work in the **application** root (the service they want to expose), not the EEP spec repo unless they are developing EEP itself.

2. Run:

   ```bash
   npx @eep-dev/agent-adopt --project . --no-compliance
   ```

3. Read `EEP_ADOPTION_REPORT.md` and `eep-generated/`. If `verify` failed, fix `apply` / config and re-run; see [AGENTS.md](https://github.com/eep-dev/EEP/blob/main/AGENTS.md) on the EEP repo for flags.

4. If they have a public base URL and credentials:

   ```bash
   npx @eep-dev/agent-adopt --project . \
     --compliance-target "$URL" \
     --compliance-api-key "$KEY" \
     --compliance-entity u/entity
   ```

5. Wire the server: [integrate-eep-after-setup-cli](https://github.com/eep-dev/EEP/blob/main/docs/guides/integrate-eep-after-setup-cli.md). Node: `@eep-dev/middleware` + `@eep-dev/gates`. Python: `eep-middleware-python`. Generated wiring files, if any, are hints—still need review for production.

6. For exposing MCP *and* EEP in one place, see `@eep-dev/mcp-bridge` in the EEP monorepo (`references/positioning.md`).
