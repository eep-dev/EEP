# How to use the EEP Setup CLI (`@eep-dev/setup-cli`)

This guide walks through **two adoption paths**:

1. **Greenfield** — create a new EEP setup configuration and generated artifacts in an empty or new folder.
2. **Brownfield** — point the CLI at an **existing** API repository, detect stack signals, then generate the same artifacts next to your code.

The CLI binary is named **`eep-setup`**.

### What you see on the terminal vs. what lands on disk

Every command ends with **one line of JSON** on stdout. That line is the **machine-readable result** (for scripts and exit-code automation). It is **not** the only output of the workflow.

| Step | On disk (the real deliverable) | On stdout |
|------|--------------------------------|-----------|
| `init` / `inject` | **`eep-setup.json`** (or `--out` path) — full setup config | Progress text, then **`Wrote setup config: …`**, then JSON |
| `apply` | **`eep-generated/`** (or `--output`) — manifests, OpenAPI, gates, etc. | `Applied N artifacts to …`, then JSON |
| `verify` | **`setup-report.json`** and **`setup-report.md`** under the output dir | JSON summary line |

If you only glance at the last JSON line, you might think “nothing was generated.” **Always open the directory** you passed as `--out` / `--output`, or run `ls` after each command. The JSON `details.output_file` / `details.output_dir` fields echo those paths.

**Interactive prompts:** pass **`--interactive`** to `init` or `inject` on a TTY to fill **identity** fields (org, hostname, base URL, DID). In CI or non-TTY environments, prompts are skipped — use **`--answers`** for non-interactive overrides. Set **`EEP_SETUP_CI=1`** to force non-interactive behavior.

**Template alias:** **`--template`** is an alias for **`--preset`** (same preset names: `exchange`, `saas`, …).

**Production apply:** use **`apply --production`** to refuse placeholder identities (`example.com`, `did:web:example.com`, etc.) before writing artifacts.

---

## Prerequisites

- **Node.js** 18+ (for running the CLI).
- From the **EEP monorepo**, install and build the package once:

```bash
cd EEP/packages/@eep-dev/setup-cli
npm install
npm run build
```

After build, you can invoke:

- `node dist/index.js <command> ...` from that directory, or
- `npx tsx src/index.ts <command> ...` if you prefer running TypeScript directly (same flags).

When the package is published to npm, you will also be able to run `npx @eep-dev/setup-cli` / `eep-setup` without cloning the repo.

### Install path: EEP monorepo vs published npm

| Situation | What to run |
|-----------|-------------|
| **You cloned `eep-dev/EEP`** | `cd packages/@eep-dev/setup-cli && npm install && npm run build`, then `node dist/index.js …` or `npx tsx src/index.ts …` from that package directory (paths in examples assume this layout). |
| **Published package** (when released) | `npx @eep-dev/setup-cli@latest <command> …` or install globally / in CI: `eep-setup` from the package `bin`. Same flags; no need to build TypeScript locally. |
| **CI / automation** | Prefer a **pinned** npm version and non-interactive flags: `--answers` for `init`/`inject`, optional `--no-interactive` where supported. |

After artifacts exist, wire your HTTP app using **[integrate-eep-after-setup-cli.md](./integrate-eep-after-setup-cli.md)** and the runtime libraries [`@eep-dev/middleware`](../../packages/@eep-dev/middleware/README.md) / [`eep-middleware-python`](../../packages/eep-middleware-python/README.md).

---

## Command overview

| Command | Purpose |
|--------|---------|
| `init` | Create **`eep-setup.json`** (optional **`--preset`** / **`--template`**, **`--interactive`**, **`--answers`**). |
| `inject` | Scan **`--project`** and write **`eep-setup.json`** (optional **`--interactive`**, **`--answers`**). |
| `apply` | Generate artifacts from `--config` and **write** them (**`--dry-run`** preview; **`--production`** blocks placeholder identity). |
| `verify` | Check expected files under `--output` and write JSON/Markdown reports. |
| `doctor` / `status` | Inspect generated output for issues and readiness. |
| `upgrade` | Bump `setup_schema_version` in the config file. |
| `watch` | Runs `apply` in one cycle; **`--dry-run`** previews, **`--once`** marks a single run (see command `details.watch_mode`). |
| `rotate-secrets` | Rotate webhook HMAC secrets in an `.env` file safely. |

---

## Presets (`init` and `inject`)

Built-in presets (see `src/prompts/presets.ts`) include:

- `exchange`
- `marketplace`
- `saas`
- `data-provider`
- `iot-publisher`

Unknown preset names fall back to **`saas`**.

Optional **`--answers path/to/answers.json`**: a JSON object merged on top of the preset (non-interactive overrides).

---

## Path A — Greenfield (from scratch)

**Goal:** produce `eep-setup.json` and a folder of generated EEP artifacts without an existing API codebase.

### 1. Create the setup config

From a directory where you want the config file (e.g. a new `my-eep/` folder):

```bash
cd EEP/packages/@eep-dev/setup-cli   # or use global path to dist/index.js

node dist/index.js init --preset exchange --out /absolute/path/to/my-eep/eep-setup.json
```

Use another preset if it fits your product (`marketplace`, `data-provider`, etc.).

### 2. (Optional) Override fields with answers

Create `answers.json` with partial overrides (structure must match mergeable fields in `EEPSetupConfig`), then:

```bash
node dist/index.js init --preset saas --answers /absolute/path/to/answers.json --out /absolute/path/to/my-eep/eep-setup.json
```

### 3. Generate and write artifacts

```bash
# Preview only (no writes)
node dist/index.js apply --config /absolute/path/to/my-eep/eep-setup.json --dry-run

# Write files under eep-generated/ (must stay under current working directory unless you use --unsafe-paths)
cd /absolute/path/to/my-eep
node /path/to/setup-cli/dist/index.js apply --config ./eep-setup.json --output ./eep-generated
```

By default, **`apply` refuses** output directories that escape the current working directory (path traversal protection). Use **`--unsafe-paths`** only when you explicitly need to write outside `cwd`.

### 4. Verify and operate

```bash
node /path/to/setup-cli/dist/index.js verify --output ./eep-generated
node /path/to/setup-cli/dist/index.js doctor --output ./eep-generated
node /path/to/setup-cli/dist/index.js status --output ./eep-generated
```

`verify` writes **`setup-report.json`** and **`setup-report.md`** under the output dir (override with `--report-json` / `--report-md`).

### 5. Secrets

If you maintain webhook signing secrets in `.env`:

```bash
node /path/to/setup-cli/dist/index.js rotate-secrets --env /absolute/path/to/my-eep/.env
```

When a secret already exists, the previous value is kept as **`EEP_WEBHOOK_SECRET_PREVIOUS`** for overlap rotation.

---

## Path B — Existing project (integrate EEP)

**Goal:** keep your application repo unchanged except for new config and generated artifacts, then wire HTTP behavior using official middleware packages.

### 1. Run `inject` against your API root

Point `--project` at the folder that contains `package.json`, `go.mod`, `pyproject.toml`, etc.:

```bash
cd EEP/packages/@eep-dev/setup-cli

node dist/index.js inject --project /absolute/path/to/your-api --out /absolute/path/to/your-api/eep-setup.json
```

The CLI runs **project detection** (language, framework, infra hints). The result is stored in the generated config metadata (`detected_profile` in command `details` when run via JSON output).

Optional: combine with **`--preset`** and **`--answers`** the same way as `init`.

### 2. Apply artifacts next to your code

```bash
cd /absolute/path/to/your-api
node /path/to/setup-cli/dist/index.js apply --config ./eep-setup.json --output ./eep-generated
```

Choose `./eep-generated` (or another name) and add it to **`.gitignore`** if generated files should not be committed.

### 3. Verify

```bash
node /path/to/setup-cli/dist/index.js verify --output ./eep-generated
```

Fix any missing files reported before deploying.

### 4. Wire runtime: Node (`@eep-dev/middleware`)

Add the middleware package to your API (path or workspace as appropriate for your monorepo):

- Package: **`EEP/packages/@eep-dev/middleware`**
- Provides **`EEPServer`**, Express/Fastify/Hono/Koa adapters, and adapter interfaces for auth, persistence, and event bus.

Mount routes and middleware according to your framework’s pattern, using **`adapter-config.json`** and other generated files under `eep-generated/` as the source of truth for EEP-specific wiring.

### 5. Wire runtime: Python (`eep-middleware-python`)

- Package: **`EEP/packages/eep-middleware-python`**
- FastAPI router helpers and Flask/Django integration points; same conceptual split as the Node package.

### 6. Ongoing lifecycle

- **`upgrade --config eep-setup.json --to-version …`** — when the setup schema evolves.
- **`watch`** — local dev: regenerate artifacts when `eep-setup.json` changes.
- **`doctor` / `status`** — before releases or after config edits.

---

## Security checklist

1. **Do not** commit production secrets; use env vars and `rotate-secrets` for HMAC keys.
2. Treat **`--unsafe-paths`** as a last resort; prefer keeping generated output under the project root.
3. Store **`verify`** reports in CI artifacts for audit trails (JSON + Markdown).

---

## Related documentation

- Short reference: [quick-setup-cli.md](./quick-setup-cli.md)
- **After CLI — wire middleware and deploy:** [integrate-eep-after-setup-cli.md](./integrate-eep-after-setup-cli.md)
- **Fast paths:** [five-minute-proof.md](./five-minute-proof.md)
- **CI / verify reports:** [eep-ready-verification.md](./eep-ready-verification.md)
- **Runtime matrix:** [implementation-matrix.md](./implementation-matrix.md)
- **Positioning (MCP/A2A):** [eep-positioning-complementary.md](./eep-positioning-complementary.md)
- **Adoption metrics (internal):** [adoption-metrics.md](./adoption-metrics.md)
- Reference deployment (Docker, dual Node/Python API): [reference-deployment-eep-api.md](./reference-deployment-eep-api.md)
- Dispatch and delivery: [how-to-dispatch.md](./how-to-dispatch.md)

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| `apply blocked unsafe output path` | Run `apply` with `cwd` such that `--output` resolves under it, or pass `--unsafe-paths` deliberately. |
| `verify` reports missing files | Re-run `apply` with the same `--config` and `--output` (omit `--dry-run`). |
| Preset seems wrong | Pass an explicit `--preset` or use `--answers` to override identity/conformance fields. |

For framework-specific mounting issues, use the detector output from `inject` and align with **`@eep-dev/middleware`** or **`eep-middleware-python`** adapter docs in the repository.

---

## When is EEP “fully implemented”?

The CLI gets you to a **verified artifact bundle** (config + generated files + `verify` / `doctor` / `status` green). **Production EEP** still requires:

1. **Serve generated HTTP surfaces** — e.g. host `.well-known/eep.json` and any routes described in `openapi-eep.json` at URLs consistent with `identity.base_url` in `eep-setup.json`.
2. **Wire runtime middleware** — mount **`@eep-dev/middleware`** (Node) or **`eep-middleware-python`** using `adapter-config.json` and your auth/DB/event adapters.
3. **Secrets and env** — configure webhook signing (`rotate-secrets`), API keys, and deployment-specific values; keep secrets out of git.
4. **Optional: reference stack** — for a full dual-runtime example, see [reference-deployment-eep-api.md](./reference-deployment-eep-api.md) and `examples/eep-reference-implementation/`.

**Definition of done (CLI + integration):** `apply` (without `--dry-run`) succeeds, `verify` reports no missing files, `status` is healthy, and your API process actually serves the EEP endpoints using the middleware package — not only the generated static files on disk.
