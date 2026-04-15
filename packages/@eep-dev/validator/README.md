# @eep-dev/validator

> **SSRF prevention, event type validation, and URL safety for EEP-compliant publishers.**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../../docs/current/SPECIFICATION.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../../LICENSE)

---

## Overview

`@eep-dev/validator` provides critical security and validation utilities for platforms implementing the Entity Engagement Protocol. Every EEP publisher **must** validate subscriber-provided webhook URLs to prevent Server-Side Request Forgery (SSRF) attacks.

This package provides:

- **SSRF Prevention** — DNS-aware URL validation blocking private/reserved IP ranges
- **Event Type Validation** — Pattern syntax checking for subscription event filters
- **Event Type Matching** — Wildcard-aware pattern matching for event routing

---

## Installation

```bash
npm install @eep-dev/validator
```

Or use from the monorepo:

```bash
cd packages/@eep-dev/validator
npm install
npm run build
```

---

## Quick Start

### SSRF URL Validation

```typescript
import { validateSSRF, SSRFError } from '@eep-dev/validator';

// In your subscription creation handler:
async function handleSubscribe(req, res) {
    try {
        await validateSSRF(req.body.delivery_url);
        // URL is safe — proceed with subscription creation
    } catch (err) {
        if (err instanceof SSRFError) {
            return res.status(400).json({
                error: 'unsafe_url',
                detail: err.message,
            });
        }
        throw err;
    }
}
```

### Event Type Pattern Validation

```typescript
import { validateEventTypePattern } from '@eep-dev/validator';

// Validate patterns from subscription requests
const pattern = req.body.event_types[0]; // e.g., "com.example.entity.*"

if (!validateEventTypePattern(pattern)) {
    return res.status(400).json({
        error: 'invalid_event_type',
        detail: `Pattern "${pattern}" does not match EEP event type syntax`,
    });
}
```

### Event Type Matching (Dispatch Time)

```typescript
import { matchesAnyPattern } from '@eep-dev/validator';

// When dispatching events, check if a subscription should receive it
const eventType = 'com.example.entity.updated';
const subscribedPatterns = ['com.example.entity.*', 'com.example.trust.changed'];

if (matchesAnyPattern(eventType, subscribedPatterns)) {
    // Deliver to this subscriber
    await deliverWebhook(subscription, event);
}
```

---

## API Reference

### SSRF Prevention

#### `validateSSRF(url, options?): Promise<void>`

Validates that a URL is safe for outbound HTTP requests. Throws `SSRFError` if unsafe.

**Checks performed:**
1. URL must use `https://` (or `http://` if `allowHttp: true`)
2. Hostname must not be a localhost alias
3. DNS-resolved IP must not fall in a private/reserved range

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | — | The URL to validate |
| `options.allowHttp` | `boolean` | `false` | Allow `http://` (dev only, **never in production**) |

**Blocked IP Ranges:**

| Range | Label |
|-------|-------|
| `127.0.0.0/8` | IPv4 loopback |
| `10.0.0.0/8` | Private class A (RFC 1918) |
| `172.16.0.0/12` | Private class B (RFC 1918) |
| `192.168.0.0/16` | Private class C (RFC 1918) |
| `169.254.0.0/16` | Link-local (includes AWS metadata `169.254.169.254`) |
| `0.0.0.0/8` | Reserved |
| `224.0.0.0/4` | Multicast |
| `240.0.0.0/4` | Reserved/Broadcast |
| `::1` | IPv6 loopback |
| `fc00::/7` | IPv6 unique local |
| `fe80::` | IPv6 link-local |
| `::ffff:*` | IPv4-mapped IPv6 (prevents bypass) |

#### `SSRFError`

Custom error class thrown when a URL is unsafe. Extends `Error`.

```typescript
import { SSRFError } from '@eep-dev/validator';

try {
    await validateSSRF('https://169.254.169.254/latest/meta-data/');
} catch (err) {
    // SSRFError: Blocked IP: 169.254.169.254 falls within Link-local (169.254.0.0/16)
}
```

---

### Event Type Validation

#### `validateEventTypePattern(pattern): boolean`

Validates that an event type pattern follows EEP syntax rules.

**Valid patterns:**
- `com.example.entity.updated` — dot-separated lowercase segments
- `com.example.entity.*` — wildcard suffix
- `entity` — single segment

**Invalid patterns:**
- `Entity.updated` — uppercase
- `md..more` — double dots
- `com.example.entity.up-dated` — special characters
- `1entity` — starts with number

#### `matchesEventType(eventType, pattern): boolean`

Check if a specific event type matches a subscription pattern.

```typescript
matchesEventType('com.example.entity.updated', 'com.example.entity.*');  // true
matchesEventType('com.example.trust.changed', 'com.example.entity.*');   // false
matchesEventType('com.example.entity', 'com.example.entity.*');          // true (exact prefix)
```

#### `matchesAnyPattern(eventType, patterns): boolean`

Check if an event type matches any pattern in a subscription's `event_types` array.

```typescript
matchesAnyPattern('com.example.entity.updated', [
    'com.example.entity.*',
    'com.example.trust.*',
]);  // true
```

---

## Tests

```bash
npm test
# or
npx vitest run
```

Comprehensive tests cover:
- Event type pattern validation (9 cases: valid patterns, invalid patterns, edge cases)
- Event type matching with wildcards (6 cases: exact, wildcard, prefix, cross-namespace)
- `matchesAnyPattern` (4 cases: match, no-match, empty, exact)
- `SSRFError` type checks (3 cases)
- SSRF URL validation (8 cases: schemes, localhost, reserved IPs, IPv6)
- SSRF DNS-mocked private IP ranges (8 cases: 10.x, 172.16.x, 192.168.x, 169.254.x, loopback, multicast, public IP)

---

## Security Rationale

This package implements **EEP security.md §3 — SSRF Prevention**. It is critical because:

1. **Webhook URL is subscriber-provided.** An attacker could supply `http://169.254.169.254/latest/meta-data/` to access the cloud metadata service.
2. **DNS rebinding.** We resolve DNS at validation time, not at request time. For maximum security, also pin resolved IPs at the HTTP client level.
3. **IPv4-mapped IPv6 bypass.** We explicitly block `::ffff:*` addresses to prevent attackers from bypassing the IPv4 blocklist via IPv6 notation.

---

## Specification Reference

- [EEP security.md §3 — SSRF Prevention](../../../docs/current/security.md)
- [RFC 1918 — Address Allocation for Private Internets](https://tools.ietf.org/html/rfc1918)
- [RFC 5735 — Special Use IPv4 Addresses](https://tools.ietf.org/html/rfc5735)
- [RFC 6890 — Special-Purpose IP Address Registries](https://tools.ietf.org/html/rfc6890)

---

## License

Apache 2.0 — See [LICENSE](../../../LICENSE)
