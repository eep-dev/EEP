# `@eep-dev/agent-adopt`

One-shot CLI for **adopting EEP** in an existing application repository: runs **`eep-setup` `inject` → `apply` → `verify`**, optional **Express / FastAPI** best-effort wiring, and writes **`EEP_ADOPTION_REPORT.md`**.

## Install

Published (when available): `npm install -g @eep-dev/agent-adopt` or use `npx @eep-dev/agent-adopt`.

From this monorepo:

```bash
cd packages/@eep-dev/agent-adopt && npm install && npm run build
node dist/index.js --project /path/to/app --no-compliance
```

## Usage

```bash
npx @eep-dev/agent-adopt --project . --no-compliance
```

| Flag | Meaning |
|------|--------|
| `--project`, `-p` | App root (default: cwd) |
| `--config` | `eep-setup.json` path |
| `--output` | `eep-generated` directory |
| `--answers` | Non-interactive answers for `inject` |
| `--no-patch` | Skip Express/FastAPI file patchers |
| `--no-compliance` | Do not run live `compliance-cli` |
| `--compliance-target` | Base URL for `npx @eep-dev/compliance-cli` |
| `--compliance-api-key`, `--compliance-entity` | Passed through to compliance CLI |
| `--report` | Report path (default: `./EEP_ADOPTION_REPORT.md`) |

## Requirements

- Node 18+ for this package; **`@eep-dev/compliance-cli`** recommends Node 22+ when you use live checks.
- Runtime wiring still needs **`@eep-dev/middleware`** / **`eep-middleware-python`** in the target app (see EEP `docs/guides/integrate-eep-after-setup-cli.md`).

## See also

- [AGENTS.md](../../../AGENTS.md) (repo root)
- [docs/strategy/agent-adoption-strategy.md](../../../docs/strategy/agent-adoption-strategy.md)

License: Apache-2.0
