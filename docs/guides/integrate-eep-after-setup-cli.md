# After `setup-cli`: wire EEP into your application

This guide picks up where **[how-to-setup-cli.md](./how-to-setup-cli.md)** ends. The CLI produces **`eep-setup.json`** and **`eep-generated/`**; this document describes what integrators should do next.

## What the CLI already guarantees

- A consistent **setup config** and **artifact bundle** (`verify` / `status` can pass).
- **`adapter-config.json`** aligned with `inject` detection (framework, auth/DB/event defaults).

## What still requires engineering work

| Area | Why |
|------|-----|
| **Identity & URLs** | `identity.domain`, `base_url`, `did` are often still placeholders until you set real values. |
| **HTTP surface** | Static files under `eep-generated/` are not automatically served by your process; you must mount routes or deploy them behind a gateway. |
| **Persistence & messaging** | Defaults assume patterns (e.g. Postgres + Redis); you provide connections and adapter implementations where you move beyond in-memory defaults. |
| **Secrets** | Webhook signing and API keys belong in env / secret stores, not in git. |

---

## Recommended order of operations

### 1. Customize `eep-setup.json`

Edit (or regenerate with **`--answers`**) at least:

- `identity.org_name`, `identity.domain`, `identity.base_url`, `identity.did`
- `conformance.environment` when you promote toward production

Then run **`apply`** again so **`eep-generated/`** stays in sync.

### 2. Add the runtime library for your language

- **Node:** `@eep-dev/middleware` (from this monorepo or your package registry when published).
- **Python:** `eep-middleware-python`.

Install paths depend on your repo layout (workspace `file:`, `npm link`, or published version).

### 3. Construct `EEPServerOptions` (Node)

The middleware core is **`EEPServer`**; options are **`EEPServerOptions`**:

- **`baseUrl`**: must match how clients reach your API (same origin as `identity.base_url` in normal setups).
- **`did`**: your deployment DID (same as `identity.did` in config).
- **`gateConfig`**: optional; use **`parseGateConfig`** from `@eep-dev/gates` with JSON parsed from **`eep-generated/gate-config.json`** if the schema matches your gates package version (adjust field names if your generator and parser drift).
- **`services`**: optional; align with **`eep-generated/service-catalog.json`** shape.
- **`authAdapter` / `dbAdapter` / `eventBusAdapter`**: start with defaults for a smoke test; swap for **`JWTAuthAdapter`**, **`PostgresDBAdapter`**, **`RedisEventBusAdapter`**, etc., when wiring real infrastructure.

See package exports in **`packages/@eep-dev/middleware/src/index.ts`**.

### 4. Mount routes (Express example)

`createEEPRouter` returns **route bindings**, not a ready-made Express `Router`. Register each binding on your `app` (method + path + handler that forwards to `execute` with the incoming request shape).

Conceptually:

```typescript
import { createEEPRouter } from "@eep-dev/middleware";
import { parseGateConfig } from "@eep-dev/gates";
import { readFileSync } from "node:fs";
import express from "express";

const app = express();
const gateRaw = JSON.parse(readFileSync("eep-generated/gate-config.json", "utf8"));
const { routes } = createEEPRouter({
  baseUrl: process.env.EEP_BASE_URL ?? "https://api.example.com",
  did: process.env.EEP_DID ?? "did:web:example.com",
  gateConfig: parseGateConfig(gateRaw),
});

for (const route of routes) {
  app[route.method](route.path, async (req, res) => {
    const out = await route.execute({
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      query: req.query as Record<string, string>,
      params: req.params as Record<string, string>,
      body: req.body,
    });
    res.status(out.status);
    for (const [k, v] of Object.entries(out.headers ?? {})) {
      res.setHeader(k, v as string);
    }
    res.send(out.body ?? "");
  });
}
```

Adapt paths if you mount under a sub-prefix; keep public URLs consistent with **`openapi-eep.json`** and **`.well-known/eep.json`**.

### 5. Validate behavior

- Hit **`GET /.well-known/eep.json`** and compare to **`eep-generated/.well-known/eep.json`** (or serve that file statically in dev).
- Run **`eep-generated/eep-contract-tests/basic.hurl`** (or equivalent) against your base URL.
- Use **[testing-and-validation.md](./testing-and-validation.md)** and your compliance runner for tier targets.

### 6. Deploy and operate

- **[reference-deployment-eep-api.md](./reference-deployment-eep-api.md)** — Docker Compose layout for the **reference** stack (Node + Python + infra).
- **[how-to-dispatch.md](./how-to-dispatch.md)** — event delivery semantics.
- **[runbook-webhook-delivery.md](../ops/runbook-webhook-delivery.md)** — webhook operations.

---

## Relationship to `examples/eep-reference-implementation`

The reference Node service demonstrates protocol behavior (gates, SSE, subscriptions, optional Postgres/Redis) but **does not** mount **`@eep-dev/middleware`**’s `createEEPRouter`; it uses a custom HTTP server. Treat it as a **behavioral reference**, and use **`@eep-dev/middleware`** when you want the packaged route table inside Express/Fastify/Hono/Koa.

---

## See also

- [five-minute-proof.md](./five-minute-proof.md) — fastest paths to a running surface
- [eep-ready-verification.md](./eep-ready-verification.md) — CI and `verify` reports
- [examples/eep-middleware-express-mini](../../examples/eep-middleware-express-mini/README.md) — minimal Express + middleware

---

## Documentation completeness (honest checklist)

| Topic | Where it lives | Status |
|-------|----------------|--------|
| CLI: `init` / `inject` / `apply` / `verify` | [how-to-setup-cli.md](./how-to-setup-cli.md) | Documented |
| Post-CLI wiring (this page) | This guide | Use this after CLI |
| Middleware API surface | [packages/@eep-dev/middleware/README.md](../../packages/@eep-dev/middleware/README.md) + source | Quickstart + exports |
| Runnable dual API + compose | [reference-deployment-eep-api.md](./reference-deployment-eep-api.md) + `examples/eep-reference-implementation/` | Documented |
| Enterprise rollout | [enterprise-implementation-playbook.md](./enterprise-implementation-playbook.md) | Broader than CLI |

If something is missing for your stack, open an issue or PR against **`docs/guides/`** with the framework-specific snippet you needed.
