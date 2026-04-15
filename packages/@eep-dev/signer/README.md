# @eep-dev/signer

> **HMAC-SHA256 webhook signing and verification for EEP-compliant platforms.**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../../docs/current/SPECIFICATION.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../../LICENSE)

---

## Overview

`@eep-dev/signer` implements the [Standard Webhooks](https://www.standardwebhooks.com/) HMAC-SHA256 signature algorithm as required by **EEP SPECIFICATION.md §5.3**.

The signed content format is:

```
{webhook-id}.{webhook-timestamp}.{raw-body}
```

This package provides:

- **Signing**: Generate `webhook-signature` header values for outbound webhook deliveries
- **Verification**: Validate inbound webhook signatures with timing-safe comparison
- **Replay protection**: Reject timestamps outside a configurable tolerance window (default: 60 seconds)
- **Multi-signature support**: Parse and verify space-separated signature lists (`v1,sig1 v1,sig2`)
- **Convenience helper**: One-call `verifyEEPWebhook()` for Express/Hono/Fastify handlers

---

## Installation

```bash
npm install @eep-dev/signer
```

Or use from the monorepo:

```bash
# From the EEP root
cd packages/@eep-dev/signer
npm install
npm run build
```

---

## Quick Start

### Signing (Publisher Side)

```typescript
import { EEPSigner } from '@eep-dev/signer';

const signer = new EEPSigner(process.env.WEBHOOK_SECRET!);

const webhookId = `msg_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify(eventPayload);

const signature = signer.sign(webhookId, timestamp, body);

// Set these headers on the outbound webhook request:
// webhook-id: msg_1700000000000
// webhook-timestamp: 1700000000
// webhook-signature: v1,BASE64_HMAC
```

### Verification (Subscriber Side)

```typescript
import { EEPSigner, EEPSignatureError } from '@eep-dev/signer';

const signer = new EEPSigner(process.env.DELIVERY_SECRET!);

try {
    const isValid = signer.verify(
        req.headers['webhook-id'],
        req.headers['webhook-timestamp'],
        req.headers['webhook-signature'],
        rawBody,           // raw request body string
        60                 // tolerance in seconds (default: 60s)
    );

    if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Safe to process the event
    const event = JSON.parse(rawBody);
} catch (err) {
    if (err instanceof EEPSignatureError) {
        // Structural issue: bad timestamp, parse error, etc.
        return res.status(400).json({ error: err.message });
    }
}
```

### Convenience Function

```typescript
import { verifyEEPWebhook } from '@eep-dev/signer';

app.post('/hooks/eep', express.raw({ type: 'application/json' }), (req, res) => {
    const valid = verifyEEPWebhook(
        req.body.toString(),
        req.headers,
        process.env.EEP_SECRET!
    );

    if (!valid) return res.status(401).json({ error: 'Invalid signature' });

    const event = JSON.parse(req.body.toString());
    console.log('Verified event:', event.type);
});
```

---

## API Reference

### `EEPSigner`

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `constructor(secret)` | `secret: string` (≥16 chars) | `EEPSigner` | Create a signer instance |
| `sign(webhookId, timestamp, rawBody)` | `string, string, string` | `string` | Generate `v1,BASE64` signature |
| `verify(webhookId, timestamp, signature, rawBody, tolerance?)` | `string, string, string, string, number?` | `boolean` | Verify signature + timestamp freshness |

### `verifyEEPWebhook(rawBody, headers, secret)`

One-call convenience. Returns `boolean`. Catches all errors internally and returns `false` on any failure.

### `EEPSignatureError`

Thrown when:
- Timestamp is not a valid number
- Timestamp is outside the tolerance window (replay attack prevention)
- Signature format is structurally invalid

**Not thrown** for a simple wrong signature — that returns `false`.

---

## Security Considerations

| Aspect | Implementation |
|--------|---------------|
| **Timing-safe comparison** | Uses `crypto.timingSafeEqual` to prevent timing attacks |
| **Replay protection** | Rejects timestamps older than 60 seconds by default |
| **Secret length** | Minimum 16 characters enforced at construction |
| **Multi-sig support** | Iterates space-separated signatures without short-circuiting |

---

## Tests

```bash
npm test
# or
npx vitest run
```

Comprehensive tests cover constructor validation, deterministic signing, signature verification, replay attack prevention, multi-signature parsing, convenience helper behavior, and edge cases.

---

## Specification Reference

- [EEP SPECIFICATION.md §5.3 — Webhook Security](../../../docs/current/SPECIFICATION.md)
- [EEP security.md §2 — HMAC-SHA256](../../../docs/current/security.md)
- [Standard Webhooks](https://www.standardwebhooks.com/)

---

## License

Apache 2.0 — See [LICENSE](../../../LICENSE)
