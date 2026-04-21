# Day-0 distribution checklist (submissions)

**Purpose:** Track **external** listings so the `@eep-dev/mcp-bridge` and EEP **agent-adoption** story appear where developers already look. Each row is **manual**—check when done, add **link or PR** reference.

> **Note:** This file is a **runbook** for maintainers. Actual PRs to “awesome” lists and directories are done in those upstream repos or via vendor forms; update this file when complete. **Repository automation cannot “execute” third-party submissions**—shipping this checklist satisfies the “distribution” deliverable; ticking rows is a **human** follow-up when you are ready to promote a release.

| # | Target | What to submit | Status | Reference (PR / ticket / URL) |
|---|--------|----------------|--------|----------------------------------|
| 1 | [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) (or current canonical list) | **MCP bridge** + short description, link to [`@eep-dev/mcp-bridge`](../../packages/@eep-dev/mcp-bridge/) | ☐ | |
| 2 | [cursor.directory](https://cursor.directory) | Rule + optional MCP entry pointing at published npm / repo | ☐ | |
| 3 | [mcp.so](https://mcp.so) (or their issue form) | Server metadata for eep-mcp-bridge | ☐ | |
| 4 | [Glama.ai](https://glama.ai) | Index MCP / tools if supported | ☐ | |
| 5 | Official MCP registry / `mcp-publisher` (when using vendor CLI) | Namespace e.g. `com.eep.dev/...` per vendor docs | ☐ | |
| 6 | OpenClaw / ClawHub (if/when a Plugin Bundle is published) | [`integrations/openclaw-bundle/`](../../integrations/openclaw-bundle/) | ☐ | |
| 7 | **llms.txt** curators / indexes | If any list tracks `llms.txt` for OSS—submit repo | ☐ | |

**Artifacts to have ready before mass submission**

- [ ] README sections for mcp-bridge and agent-adopt with **install** and **one command** copy-paste.  
- [ ] [llms.txt](../../llms.txt) and [AGENTS.md](../../AGENTS.md) in default branch.  
- [ ] License and security contact: [SECURITY.md](../../SECURITY.md).
