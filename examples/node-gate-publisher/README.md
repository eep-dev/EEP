# EEP gated publisher (Node.js + Hono)

A minimal publisher that uses `@eep-dev/gates` to protect resources behind entity-defined tiers.

## What this shows

- Loading and validating a gate configuration
- Returning HTTP 402 with machine-readable bodies
- Plugging in a custom `ProofVerifier` (Stripe example)
- Tier-aware event delivery
- Commerce negotiation over WebSocket

## Files

- `server.ts` — Publisher with gate and commerce endpoints
- `gate-config.json` — Example gate configuration with 3 tiers
- `package.json` — Dependencies

## Run

The `@eep-dev/gates` dependency points at `../../packages/@eep-dev/gates` and loads `dist/index.js`. That folder is built with TypeScript and is not committed, so build it once before starting the example:

```bash
(cd ../../packages/@eep-dev/gates && npm ci && npm run build)
```

Then from this directory:

```bash
npm install
npx tsx server.ts
```

## Endpoints

```
GET  /.well-known/eep.json      → EEP manifest (§4.1)
GET  /eep/gates/:did          → gate configuration
GET  /eep/content/:did/:path  → gated resource (returns 402 if insufficient proof)
POST /eep/subscribe           → subscription with optional tier + proofs
GET  /eep/services/:did       → service catalog
WS   /eep/pulse               → WebSocket with commerce negotiation
```
