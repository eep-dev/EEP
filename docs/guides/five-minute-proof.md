# Five-minute proof (EEP)

Goal: go from **clone** to **working HTTP surface** and a **verification command** in a few minutes.

## Path A — Reference stack (Node + Python + infra)

1. From the **EEP repo root**, start the reference deployment (Docker required):

   ```bash
   cd examples/eep-reference-implementation
   docker compose up --build -d
   ```

2. Wait until **`node-api`** is healthy (port **3100** by default).

3. From the **EEP repo root**, run the smoke script:

   ```bash
   bash scripts/eep-reference-smoke.sh
   ```

   Override base URL if needed:

   ```bash
   EEP_SMOKE_BASE_URL=http://127.0.0.1:3100 bash scripts/eep-reference-smoke.sh
   ```

4. Read **[reference-deployment-eep-api.md](./reference-deployment-eep-api.md)** for what is implemented and how to extend it.

## Path B — `setup-cli` on a sample repo

1. Build the CLI: `cd packages/@eep-dev/setup-cli && npm install && npm run build`

2. In a **clone of an API project**:

   ```bash
   node dist/index.js inject --project /path/to/api --out /path/to/api/eep-setup.json
   node dist/index.js apply --config /path/to/api/eep-setup.json --output /path/to/api/eep-generated
   node dist/index.js verify --output /path/to/api/eep-generated
   ```

3. Wire runtime using **[integrate-eep-after-setup-cli.md](./integrate-eep-after-setup-cli.md)**.

## Path C — Minimal Express + middleware (copy/paste)

1. Run the tiny example server:

   ```bash
   cd examples/eep-middleware-express-mini
   npm install
   PORT=3333 npm start
   ```

2. In another shell:

   ```bash
   curl -sSf http://127.0.0.1:3333/healthz
   curl -sSf http://127.0.0.1:3333/.well-known/eep.json | head
   ```

This uses **`@eep-dev/middleware`** directly — best for “how do I mount routes?” questions.

## What “done” means here

- **Path A:** smoke script exits 0; manifests and gates/services respond.
- **Path B:** `verify` exits 0 (artifacts present); then you still wire your app.
- **Path C:** `healthz` and `/.well-known/eep.json` return 200 from the Express process.

For production readiness, add **`apply --production`**, real **`identity`** values, and operational runbooks under `docs/ops/`.

## See also

- **[realworld-simulation.md](./realworld-simulation.md)** — deterministic terminal demo contrasting Next.js HTML scraping with EEP gates (`npm run demo` under `realworld-simulation/`).
