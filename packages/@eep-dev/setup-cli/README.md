# `@eep-dev/setup-cli`

Project wizard for the [Entity Engagement Protocol (EEP)](https://eep.dev): detect your stack, write **`eep-setup.json`**, generate **`eep-generated/`** artifacts (manifest, OpenAPI, gates, webhooks), and verify readiness.

The CLI binary is **`eep-setup`**.

## Install

**From the EEP monorepo** (build `dist/` before other packages that depend on it, e.g. `@eep-dev/agent-adopt`):

```bash
cd packages/@eep-dev/setup-cli
npm install
npm run build
```

Then run:

```bash
node dist/index.js <command> [options]
# or, after npm link / global install from this package:
eep-setup <command> [options]
```

**From npm** (when published):

```bash
npx @eep-dev/setup-cli@latest <command> [options]
```

Requires **Node.js 20+**.

## Typical flow

| Step | Command | On disk |
|------|---------|---------|
| 1. Config (greenfield) | `init --preset saas --out ./eep-setup.json` | `eep-setup.json` |
| 1. Config (brownfield) | `inject --project /path/to/api --out ./eep-setup.json` | `eep-setup.json` |
| 2. Generate | `apply --config ./eep-setup.json --output ./eep-generated` | `eep-generated/` |
| 3. Check | `verify --output ./eep-generated` | `setup-report.json`, `setup-report.md` |

Each command prints **progress text** and ends with **one JSON line** on stdout (for automation). The real deliverables are the files under `--out` / `--output` — not only that JSON line.

**Interactive prompts:** add `--interactive` on a TTY for `init` / `inject`. In CI, use `--answers path/to.json` or set `EEP_SETUP_CI=1`.

**Production:** `apply --production` rejects placeholder hostnames/DIDs (`example.com`, `did:web:example.com`, …).

## Commands

| Command | Purpose |
|---------|---------|
| `init` | New **`eep-setup.json`** (`--preset` / `--template`, optional `--interactive`, `--answers`) |
| `inject` | Scan **`--project`** and write config for an existing repo |
| `apply` | Generate artifacts (`--dry-run`, `--production`) |
| `verify` | Validate output; write JSON/Markdown reports |
| `doctor` | Diagnose setup issues |
| `status` | Deployment readiness summary |
| `upgrade` | Bump `setup_schema_version` in config |
| `watch` | Re-run `apply` when config changes (`--once`, `--dry-run`) |
| `rotate-secrets` | Rotate webhook HMAC secrets in `.env` |

Presets: `exchange`, `marketplace`, `saas`, `data-provider`, `iot-publisher` (unknown names fall back to `saas`).

```bash
eep-setup --help   # same as running without a command
```

## After `apply`

Generated files are not a running server. Mount routes in your app using:

- **[After setup-cli: wire EEP into your app](../../../docs/guides/integrate-eep-after-setup-cli.md)**
- Node: [`@eep-dev/middleware`](../middleware/README.md)
- Python: [`eep-middleware-python`](../../eep-middleware-python/README.md)

## Documentation

- **[How to use the Setup CLI](../../../docs/guides/how-to-setup-cli.md)** — full greenfield/brownfield walkthrough
- **[Quick setup](../../../docs/guides/quick-setup-cli.md)** — shortest path
- **[EEP specification](../../../docs/current/SPECIFICATION.md)**

## Build & test

```bash
npm install
npm run build
npm test
```

## Programmatic use

The package exports command runners and patchers for tests and tooling:

```typescript
import { runApply, runInject, applyFrameworkPatchers } from "@eep-dev/setup-cli";
```

License: Apache-2.0.
