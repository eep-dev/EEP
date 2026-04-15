# Express + `@eep-dev/middleware` (minimal)

Use this example to copy the exact pattern for mounting **`createEEPRouter`** in Express.

## Run

From **`EEP/`** repository root:

```bash
cd examples/eep-middleware-express-mini
npm install
PORT=3333 npm start
```

Smoke:

```bash
curl -sSf http://127.0.0.1:3333/.well-known/eep.json | head
curl -sSf http://127.0.0.1:3333/healthz
```

Set **`EEP_BASE_URL`** and **`EEP_DID`** to match your deployment.

See also **[docs/guides/integrate-eep-after-setup-cli.md](../../docs/guides/integrate-eep-after-setup-cli.md)**.
