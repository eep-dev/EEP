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

## Authentication adapters

Auth adapters turn inbound credentials into EEP **proofs**. They fail closed: a token is trusted
only after its signature (or the authorization server) is verified. An adapter that cannot verify
anything emits no proofs (and logs a one-time warning) rather than trusting attacker-controlled input.

- **`JWTAuthAdapter`** — verifies the JWT before emitting `did_verified` / capability proofs.
  `alg: none` is always rejected, and expired / not-yet-valid tokens are rejected (60s default skew).
  - HS256/384/512: pass a shared `secret`.
  - RSA / ECDSA / EdDSA: pass a `verifyToken` callback (e.g. wrapping `jose`) that returns the
    verified claims, or `null` if the token does not verify.
  - With neither `secret` nor `verifyToken`, the adapter emits no proofs.

  ```typescript
  import { JWTAuthAdapter } from "@eep-dev/middleware";

  const auth = new JWTAuthAdapter({ secret: process.env.JWT_SECRET });
  // asymmetric, delegating verification to your JWT library:
  // new JWTAuthAdapter({ verifyToken: async (t) => (await jwtVerify(t, key)).payload });
  ```

- **`OAuthAuthAdapter`** — requires an RFC 7662 `introspect` callback. Granted scope and the subject
  DID come from the authorization server's response, never from a client-supplied `X-OAuth-Scope` header.

  ```typescript
  import { OAuthAuthAdapter } from "@eep-dev/middleware";

  const auth = new OAuthAuthAdapter({
    introspect: async (token) => {
      const res = await fetch(introspectionUrl, {
        method: "POST",
        body: new URLSearchParams({ token })
      });
      return res.json(); // { active: boolean, scope?: string, sub?: string }
    }
  });
  ```

- **`APIKeyAuthAdapter`** — resolves an API key to `{ did, capabilities }` via your `resolver`.

## After `setup-cli`

Generate config with `@eep-dev/setup-cli`, then wire runtime using **[integrate-eep-after-setup-cli.md](../../../docs/guides/integrate-eep-after-setup-cli.md)**.

## Build & test

```bash
npm install
npm run build
npm test
```

License: Apache-2.0.
