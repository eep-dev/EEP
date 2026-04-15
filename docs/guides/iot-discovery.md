# IoT and Non-Web Discovery — EEP Alternative Discovery Mechanisms

**Whitepaper section:** §4.4 (DNS and Link Header Discovery)  
**Schema:** `schemas/v0.1/eep-manifest.json#/properties/discovery_hints`

---

## Overview

The primary EEP discovery mechanism is the `/.well-known/eep.json` manifest endpoint. However, not all EEP publishers can serve HTTP `/.well-known/` endpoints:

- **IoT devices** with constrained firmware (smart meters, industrial sensors)
- **Edge nodes** behind firewalls that block inbound HTTP
- **Embedded agents** in appliances with no HTTPS server
- **Microservices** with shared domains where `/.well-known/` is reserved

For these environments, EEP defines two alternative discovery mechanisms: **HTTP Link headers** and **DNS TXT records**. Both are defined normatively in SPECIFICATION.md §4.4.

---

## Mechanism 1: HTTP Link Header

Any HTTP response from an EEP-compatible entity MAY include a `Link` header pointing to the manifest:

```http
Link: <https://api.example.com/.well-known/eep.json>; rel="eep"
```

### Agent discovery procedure

```
1. Agent makes any HTTP request to the entity (e.g., GET /)
2. Agent inspects response headers for: Link: <...>; rel="eep"
3. Agent fetches the referenced manifest URL over HTTPS
4. Agent validates the manifest DID matches the entity's DID Document
```

### Publisher implementation

Add the header to your web framework's global middleware:

**Node.js / Express:**
```javascript
app.use((req, res, next) => {
  res.setHeader('Link', '<https://api.example.com/.well-known/eep.json>; rel="eep"');
  next();
});
```

**Python / FastAPI:**
```python
from fastapi import FastAPI, Response
from fastapi.middleware.base import BaseHTTPMiddleware

class EEPLinkHeaderMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers['Link'] = (
            '<https://api.example.com/.well-known/eep.json>; rel="eep"'
        )
        return response

app.add_middleware(EEPLinkHeaderMiddleware)
```

### Declare in manifest

```json
{
  "discovery_hints": {
    "link_header_supported": true
  }
}
```

---

## Mechanism 2: DNS TXT Record

For entities where HTTP access is restricted, a DNS TXT record at `_eep.{domain}` provides a reliable out-of-band discovery path:

### Record format (normative)

```
_eep.example.com.  300  IN  TXT  "v=eep1; manifest=https://api.example.com/.well-known/eep.json"
```

**Fields:**
| Field | Required | Description |
|---|---|---|
| `v=eep1` | ✅ Yes | EEP version tag. Identifies this TXT record as an EEP discovery record. |
| `manifest=<url>` | ✅ Yes | HTTPS URL of the `/.well-known/eep.json` manifest. MUST be HTTPS. |

### Agent discovery procedure

```
1. Agent extracts the domain from the entity's DID (e.g., did:web:api.example.com → api.example.com)
2. Agent performs DNS TXT query for _eep.{domain}
3. Agent parses the TXT record: v=eep1; manifest={url}
4. Agent validates v=eep1 prefix before trusting the rest
5. Agent fetches the manifest URL over HTTPS
6. Agent verifies manifest DID matches expected entity DID
```

### Publisher implementation (DNS zone file)

```dns
; Add to your DNS zone configuration
_eep.example.com.    300    IN    TXT    "v=eep1; manifest=https://api.example.com/.well-known/eep.json"
```

**Multiple manifests (multitenant hosting):**
```dns
_eep.api.example.com.     300  IN  TXT  "v=eep1; manifest=https://api.example.com/.well-known/eep.json"
_eep.data.example.com.    300  IN  TXT  "v=eep1; manifest=https://data.example.com/.well-known/eep.json"
```

### Declare in manifest

```json
{
  "discovery_hints": {
    "dns_txt_record": "v=eep1; manifest=https://api.example.com/.well-known/eep.json"
  }
}
```

---

## Mechanism 3: Beacon Discovery (IoT)

For IoT devices that periodically announce themselves on local networks:

```json
{
  "discovery_hints": {
    "beacon_interval_seconds": 300
  }
}
```

The agent can listen for mDNS/DNS-SD service type `_eep._tcp.local` or BLE Advertisement payloads. This is informational — agents in constrained networks may use this hint to reduce polling. The beacon payload follows the same DNS TXT format: `v=eep1; manifest={url}`.

---

## Discovery Priority Order (Normative)

When an agent is trying to discover an EEP entity with domain `{domain}`:

```
1. HTTPS: GET https://{domain}/.well-known/eep.json
   ↓ (404/unreachable)
2. HTTP Link: HEAD/GET https://{domain}/ → inspect Link: rel="eep"
   ↓ (no header)
3. DNS TXT: resolve _eep.{domain} TXT
   ↓ (NXDOMAIN/no record)
4. Discovery fails → agent reports entity not EEP-compatible
```

---

## Security Considerations

- **DNS TXT records MUST reference HTTPS URLs.** HTTP manifest URLs are rejected without inspection.
- **DNS TXT records are not authenticated.** Agents MUST verify the fetched manifest's DID matches the entity's DID Document. An attacker who controls DNS cannot forge the DID Document.
- **Link headers MUST reference the canonical manifest URL.** Agents MUST verify the manifest `did` field matches the source domain.
- **TTL considerations.** Agents SHOULD cache DNS TXT discovery results for min(TTL, 3600) seconds. Manifests themselves are cached per their `Cache-Control` header.

---

## Related

- `schemas/v0.1/eep-manifest.json` — `discovery_hints` field
- `SPECIFICATION.md §4.4` — Normative DNS/Link-header discovery requirements
- [RFC 8615](https://www.rfc-editor.org/rfc/rfc8615) — Well-Known URI specification
