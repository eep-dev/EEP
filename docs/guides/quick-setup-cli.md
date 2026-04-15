# EEP Quick Setup CLI

For a **step-by-step tutorial** (greenfield + existing projects, presets, verification, middleware pointers), see **[how-to-setup-cli.md](./how-to-setup-cli.md)**.

After `apply`, wire your application: **[integrate-eep-after-setup-cli.md](./integrate-eep-after-setup-cli.md)**.

`@eep-dev/setup-cli` provides a guided path for both:

- creating a new EEP setup (`init`)
- injecting EEP into an existing project (`inject`)

## Commands

```bash
# Create config from a preset
npx tsx src/index.ts init --preset exchange --out ./eep-setup.json

# Detect an existing project and generate inject config
npx tsx src/index.ts inject --project /path/to/api --out /path/to/api/eep-setup.json

# Preview artifacts only (no writes)
npx tsx src/index.ts apply --config /path/to/api/eep-setup.json --dry-run

# Write artifacts (default)
npx tsx src/index.ts apply --config /path/to/api/eep-setup.json --output /path/to/api/eep-generated

# Validate generated outputs
npx tsx src/index.ts verify --output /path/to/api/eep-generated

# Diagnose and summarize issues
npx tsx src/index.ts doctor --output /path/to/api/eep-generated
npx tsx src/index.ts status --output /path/to/api/eep-generated

# Upgrade schema version in setup config
npx tsx src/index.ts upgrade --config /path/to/api/eep-setup.json --to-version 0.2

# Rotate webhook signing secret safely
npx tsx src/index.ts rotate-secrets --env /path/to/api/.env
```

## Security Notes

- `apply` blocks path traversal by default; generated output must stay under current working directory unless `--unsafe-paths` is explicitly used.
- `rotate-secrets` keeps previous secret under `EEP_WEBHOOK_SECRET_PREVIOUS` when one already exists.
- `verify` emits both JSON and Markdown reports for CI and operator workflows.

## Framework Injection

`inject` auto-detects language, framework, and infra signals:

- Node: Express/Fastify/Hono/Koa/Nest/Next
- Python: FastAPI/Flask/Django/Starlette
- Go: Gin/Echo
- Rust: Actix/Axum
- Java: Spring Boot

Detection output is embedded in `details.detected_profile` and used to pre-fill adapter settings.
