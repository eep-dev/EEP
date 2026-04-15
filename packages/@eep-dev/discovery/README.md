# @eep-dev/discovery

> **EEP discovery utilities — manifest validation, Link header parsing, DNS TXT record parsing.**

[![EEP](https://img.shields.io/badge/EEP-v0.1-blue)](../../../docs/current/SPECIFICATION.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-green)](../../../LICENSE)

---

## Overview

`@eep-dev/discovery` implements the three discovery mechanisms from the EEP Whitepaper §4:

| Mechanism | Module | Description |
|-----------|--------|-------------|
| Well-known manifest | `manifest.ts` | Validate `/.well-known/eep.json` manifests against the schema |
| Link headers | `link-header.ts` | Parse HTTP `Link: <url>; rel="eep"` headers (RFC 5988) |
| DNS TXT records | `dns.ts` | Parse `_eep.domain.com TXT "v=eep1; manifest=..."` records |

## Usage

```typescript
import { validateManifest, parseLinkHeader, parseDnsTxtRecord } from '@eep-dev/discovery';

// Validate a manifest
const result = validateManifest({
    did: 'did:web:example.com',
    eep_version: '0.1',
    layers: { layer1: 'https://api.example.com/eep' },
    supported_content_types: ['application/json'],
    pqc_ready: false,
    x402_enabled: true,
});
console.log(result.valid);  // true

// Parse Link headers
const links = parseLinkHeader(response.headers.get('link'));
// [{ url: 'https://...', rel: 'eep' }]

// Parse DNS TXT records
const dns = parseDnsTxtRecord('v=eep1; manifest=https://api.example.com/.well-known/eep.json');
console.log(dns.manifestUrl);
```

## Tests

```bash
cd packages/@eep-dev/discovery && npx vitest run
```

Comprehensive tests cover manifest validation, Link header parsing, and DNS TXT parsing.

## License

Apache-2.0
