# `@eep-dev/middleware`

Framework adapters and **`EEPServer`** for serving EEP HTTP routes (manifest, entity resolution, gates, services, SSE, webhooks) inside an existing Node application.

## Install

From the EEP monorepo (path dependency):

```json
{
  "dependencies": {
    "@eep-dev/middleware": "file:../../packages/@eep-dev/middleware"
  }
}
```

When published to npm, use `npm install @eep-dev/middleware` (same import paths).

Peer: Node 18+. Depends on `@eep-dev/gates`.

## Quickstart (Express)

`createEEPRouter` returns **route bindings**. Register each on your Express `app` (or `Router`).

```typescript
import express from "express";
import { createEEPRouter } from "@eep-dev/middleware";

const app = express();
const { routes } = createEEPRouter({
  baseUrl: process.env.EEP_BASE_URL ?? "https://api.example.com",
  did: process.env.EEP_DID ?? "did:web:example.com"
});

for (const route of routes) {
  app[route.method](route.path, async (req, res) => {
    const out = await route.execute({
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      query: req.query as Record<string, string>,
      params: req.params as Record<string, string>,
      body: req.body
    });
    res.status(out.status);
    for (const [k, v] of Object.entries(out.headers ?? {})) {
      res.setHeader(k, v as string);
    }
    res.send(out.body ?? "");
  });
}
```

Optional: pass **`gateConfig`** (from `@eep-dev/gates` `parseGateConfig`), **`services`**, **`authAdapter`**, **`dbAdapter`**, **`eventBusAdapter`** — see [`src/core/eep-server.ts`](./src/core/eep-server.ts) (`EEPServerOptions`).

Exports:

- `createEEPRouter` — Express-style bindings
- `createFastifyPlugin` — Fastify (`@eep-dev/middleware/fastify`)
- `createEEPApp` — Hono (`@eep-dev/middleware/hono`)
- `createEEPMiddleware` — Koa (`@eep-dev/middleware/koa`)

## After `setup-cli`

Generate config with `@eep-dev/setup-cli`, then wire runtime using **[integrate-eep-after-setup-cli.md](../../../docs/guides/integrate-eep-after-setup-cli.md)**.

## Build & test

```bash
npm install
npm run build
npm test
```

License: Apache-2.0.
