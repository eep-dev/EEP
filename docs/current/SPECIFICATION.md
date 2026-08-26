# Entity engagement protocol (EEP) specification

**Version:** 0.1-draft  
**Status:** Pre-Release  
**Editors:** EEP Core Team (see `GOVERNANCE.md`)  
**License:** Apache 2.0

---

## Abstract

The Entity Engagement Protocol (EEP) defines how digital entities publish real-time state change events and how authorized subscribers receive them. It uses three transport layers: state resolution (REST), signal stream (SSE and Webhooks), and network pulse (WebSockets). EEP supports the agentic web, where AI agents participate directly in digital interactions.

**Informative context (non-normative):** Industry discussions of *generative engine optimization* (GEO) and machine-readable discovery for retrieval systems are motivation for publishers, not wire requirements here. The normative discovery surfaces in this specification are `Link` headers, DNS/`/.well-known/eep.json`, and related fields. Narrative background, citations, and GEO positioning appear in [`WHITEPAPER.tex`](../WHITEPAPER.tex) (Discovery and related sections).

---

## Table of contents

1. [Terminology](#1-terminology)
2. [Architecture overview](#2-architecture-overview)
3. [Layer 1: State resolution](#3-layer-1-state-resolution)
4. [Layer 2: Signal stream (SSE)](#4-layer-2-signal-stream-sse)
5. [Layer 2: Signal stream (Webhooks)](#5-layer-2-signal-stream-webhooks)
6. [Layer 3: Network pulse (WebSockets)](#6-layer-3-network-pulse-websockets)
7. [Event envelope format](#7-event-envelope-format)
8. [Event type naming convention](#8-event-type-naming-convention)
9. [Standard event catalog](#9-standard-event-catalog)
10. [Subscription lifecycle](#10-subscription-lifecycle)
11. [Authentication and authorization](#11-authentication-and-authorization)
12. [Discovery](#12-discovery)
13. [Rate limiting](#13-rate-limiting)
14. [Conformance levels](#14-conformance-levels)

---

## 1. Terminology

- **Entity**: Any digital subject with a stable identity and state that can change over time (a person, business, AI agent, or product).
- **Source**: The entity or platform originating an event, identified by a DID or URI.
- **Publisher**: The platform responsible for emitting events on behalf of entities.
- **Subscriber**: An agent, service, or system that has subscribed to receive events.
- **Event**: A structured, immutable record of a state change that occurred at a specific point in time.
- **Subscription**: A persistent, authorized relationship between a subscriber and a source's event stream.
- **DID**: Decentralized Identifier (W3C standard), used to globally identify entities without central authority.
- **HMAC**: Hash-based Message Authentication Code, used to sign webhook payloads.
- **WebSub**: W3C Web Subscription protocol. EEP borrows its intent verification mechanism.
- **MUST / SHOULD / MAY**: RFC 2119 requirement levels.

---

## 2. Architecture overview

```
                    ┌─────────────────────────────────┐
                    │         EEP PUBLISHER           │
                    │   (any compliant EEP platform)  │
                    └──────────┬──────────────────────┘
                               │  emits events
                               ▼
                    ┌─────────────────────────────────┐
                    │       EEP EVENT BUS             │
                    │  (Redis Streams / RabbitMQ)     │
                    └──────────┬──────────────────────┘
              ┌────────────────┼──────────────────┐
              ▼                ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  SSE Stream  │  │   Webhooks   │  │   WebSockets     │
    │  (Layer 2a)  │  │  (Layer 2b)  │  │    (Layer 3)     │
    └──────┬───────┘  └──────┬───────┘  └──────────────────┘
           │                 │
           ▼                 ▼
    ┌──────────────┐  ┌──────────────┐
    │ AI Agent SSE │  │ Webhook recv │
    │  Client      │  │  endpoint    │
    └──────────────┘  └──────────────┘
```

---

## 3. Layer 1: state resolution

State resolution allows agents to discover and read the current state of an entity.

> **Whitepaper §2.1 — Access Spectrum Crosswalk.** The following table maps the six access pattern names from the Whitepaper to their EEP gate type implementation. This crosswalk is normative: agents implementing any of these patterns MUST use the corresponding gate type.

| Whitepaper Access Pattern | EEP Gate Type | Description |
|---|---|---|
| public access | `public` | No gate requirement. Resource is freely accessible. |
| trust-gated | `credential` | Agent presents a W3C Verifiable Presentation proving trust level. |
| agreement-gated | `agreement` | Agent presents a signed document hash proving they accepted terms. |
| data-exchange-gated | `data_request` | Agent presents a W3C VP over requested data claims (name, org_type, etc.). |
| payment-gated | `payment` | Agent presents an on-chain transaction hash or x402 payment payload. |
| combined | `combined` | Agent must satisfy multiple gate requirements simultaneously (e.g., credential + payment). |

### 3.1 Entity resolution endpoint

```
GET /:type/:username
Accept: application/json | text/markdown | text/toon
```

A compliant publisher MUST serve at minimum:
- **JSON**: structured entity profile with capabilities, trust score, DID document, and EEP endpoint discovery headers.
- **Markdown**: human-readable representation for LLM consumption.

### 3.2 Required response headers

```http
HTTP/1.1 200 OK
Content-Type: application/json
EEP-Version: 0.1
EEP-Entity-DID: did:web:example.com:u:acme-corp
Link: <https://api.example.com/eep/subscribe>; rel="subscribe"; type="application/json"
Link: <https://api.example.com/eep/stream?source=acme-corp>; rel="monitor"
Link: </.well-known/agent.json>; rel="agent-card"
```
The `Link` header with `rel="subscribe"` MUST be present on all entity resolution responses. This is the primary EEP discovery mechanism.

### 3.2.2 Agent Request Headers

When an agent accesses restricted entity resources (e.g., submitting proofs to a gate, or posting to a protected inbox), the agent MUST include specific `EEP-` prefixed HTTP headers to identify itself and securely sign the request.

```http
EEP-Agent-DID: did:web:agent.example.com
EEP-Signature: bd56...8f9a
EEP-Nonce: 4893jd83hfb
```

- **`EEP-Agent-DID`**: The DID of the agent making the request (REQUIRED for authenticated requests).
- **`EEP-Signature`**: A cryptographic signature (e.g., Ed25519) over the request payload and nonce, asserting control over the `EEP-Agent-DID` (REQUIRED for gated access).
- **`EEP-Nonce`**: A unique, single-use random string (8-128 chars) to prevent replay attacks (REQUIRED if `EEP-Signature` is present).

### 3.3 Capability declaration

Entities MUST declare their EEP capabilities in the JSON response:

```json
{
  "eep": {
    "version": "0.1",
    "endpoint": "https://api.example.com/eep",
    "supported_delivery": ["webhook", "sse"],
    "supported_event_types": ["com.example.entity.*", "com.example.trust.*"],
    "identity": {
      "did": "did:web:example.com:u:acme-corp",
      "verification_endpoint": "https://api.example.com/did/acme-corp"
    },
    "gated": true,
    "gates_url": "https://api.example.com/eep/gates/did:web:example.com:u:acme-corp",
    "commerce": true,
    "services_url": "https://api.example.com/eep/services/did:web:example.com:u:acme-corp"
  }
}
```

The `gated`, `gates_url`, `commerce`, and `services_url` fields are OPTIONAL. They MUST be present if the entity uses gated access or offers services.

### 3.4 Gated access

Entities MAY define **gates** to restrict access to resources. A gate configuration has entity-defined **tiers**, each with a list of **requirements** and a set of **access patterns** that tier opens up.

Some ground rules:
- The protocol defines requirement **types**, not **values**. Entity owners pick their own tier names, requirement combinations, and access patterns.
- Tier names are up to the entity: `"academic"`, `"dao_members"`, `"vip"`. The protocol does not mandate any names.
- The `default_tier` MUST have zero requirements (it is the publicly accessible baseline).

#### 3.4.1 Gate configuration endpoint

```
GET /eep/gates/:entity_did
Accept: application/json
```

Returns the entity's gate configuration conforming to `gate.config.json` schema.

#### 3.4.2 Standard requirement types

| Type | Description | Proof needed |
|------|-------------|------|
| `credential` | W3C Verifiable Credential from a named issuer DID | Encoded VC (JWT / LD-Proof / SD-JWT) |
| `identity` | DID ownership proof — know-your-peer | Signed challenge response from agent's DID key |
| `agreement` | Crypto signature over SHA-256 hash of a licence document | EdDSA signature + Verifiable Presentation |
| `data_request` | Quid-pro-quo: agent provides named claims about itself/owner | Signed VP with W3C DPV purpose declaration |
| `payment` | On-chain micropayment to publisher address | Verified transaction hash from compatible L1/L2 |
| `combined` | AND/OR combination of any of the above gate types | All constituent proofs |
| `x-*` | Custom/extension types (platform-specific) | Implementation-defined |

> **Note:** The six core gate types above (`credential`, `identity`, `agreement`, `data_request`, `payment`, `combined`) are normative per Whitepaper Table 1. Additional extension types (`trust`, `connection`, `capability`, `allowlist`, `reciprocal`) are supported by EEP reference implementations but are not required for whitepaper conformance.

**Informative (non-normative):** For `agreement` gates, the licence document whose hash is signed MAY encode human-readable obligations (for example attribution strings, canonical URLs, or constraints on reuse in generated summaries). The protocol proves acceptance of that document hash; it does **not** mandate how third-party user interfaces, search engines, or LLM products display citations or links. See [`WHITEPAPER.tex`](../WHITEPAPER.tex) for publisher-facing discussion.

#### 3.4.3 Access restriction response (402)

When an agent requests a resource that requires a higher tier, publishers MUST return HTTP `402` with a body conforming to `gate.402-response.json`:

```json
{
  "error": "access_restricted",
  "resource": "content.papers.full_text",
  "current_tier": "public",
  "required_tier": "academic",
  "unmet_requirements": [
    {
      "type": "credential",
      "resolution_hint": "Verifiable Credential required: AcademicAffiliation"
    }
  ],
  "available_tiers": {
    "academic": {
      "label": "Academic Access",
      "requirements": [{"type": "credential", "credential_type": "AcademicAffiliation"}],
      "access": ["profile.*", "content.papers.*"]
    }
  },
  "gates_config_url": "https://api.example.com/eep/gates/did:web:example.com:u:alice"
}
```

The response is machine-readable. Agents can parse it and decide what to do next without human help.

#### 3.4.4 Proof validation

Proof validation is two-step:
1. **Structural validation** (protocol): does the proof have the right fields? Is it fresh (not expired, not future-dated)?
2. **Semantic validation** (platform): is the payment token actually valid? Does the VC verify against the issuer?

The protocol defines structural validation. Implementing platforms provide a `ProofVerifier` for semantic checks.

---

## 4. Layer 2: signal stream (SSE)

### 4.1 SSE endpoint

```
GET /eep/stream
Authorization: Bearer {API_KEY}
Accept: text/event-stream
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | No | Filter by entity username or DID |
| `events` | string | No | Comma-separated event type filter (e.g. `entity.updated,trust.changed`). Wildcards supported: `entity.*` |
| `last_event_id` | string | No | Resume from this event ID (see §4.3) |

### 4.2 SSE event format

Each event follows the standard `text/event-stream` format:

```
id: 01HN3QK7GX-1708123456000
event: com.example.entity.updated
data: {"specversion":"1.0","id":"01HN3QK7GX-1708123456000","source":"did:web:example.com:u:acme-corp","type":"com.example.entity.updated","time":"2026-02-22T14:30:00Z","datacontenttype":"application/json","data":{"field":"bio","previous":"Old bio","current":"New bio"}}

```

*(Note: events are separated by a blank line, as per the EventSource spec.)*

### 4.3 Guaranteed delivery via Last-Event-ID

A compliant EEP publisher MUST implement event replay. When a subscriber reconnects with the `Last-Event-ID` header (or `last_event_id` query parameter), the server MUST replay all events after that ID, up to a configurable retention window (minimum: 24 hours).

```http
GET /eep/stream?source=acme-corp
Last-Event-ID: 01HN3QK7GX-1708123456000
```

The publisher responds by replaying all missed events since `01HN3QK7GX-1708123456000`, then continues with live events.

Agent workflows often drop network connections. EEP requires replay so agents don't miss data permanently.

### 4.4 Heartbeat

The publisher MUST send a comment heartbeat every 15 seconds to detect stale connections:

```
: heartbeat 2026-02-22T14:30:00Z

```

---

## 5. Layer 2: signal stream (Webhooks)

### 5.1 Webhook subscription

```http
POST /eep/subscribe
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "source_did": "did:web:example.com:u:acme-corp",
  "event_types": ["com.example.entity.updated", "com.example.trust.*"],
  "delivery_method": "webhook",
  "delivery_url": "https://agent.example.com/hooks/eep",
  "delivery_format": "cloudevents/v1.0",
  "metadata": {
    "description": "Monitor Acme Corp for trust changes"
  }
}
```

**Successful Response:**
```json
{
  "subscription_id": "sub_01HN3QK7GX",
  "status": "pending_verification",
  "source_did": "did:web:example.com:u:acme-corp",
  "event_types": ["com.example.entity.updated", "com.example.trust.*"],
  "delivery_url": "https://agent.example.com/hooks/eep",
  "created_at": "2026-02-22T14:30:00Z",
  "verification_expires_at": "2026-02-22T14:40:00Z"
}
```

The subscription sits in the `pending_verification` status until WebSub intent verification completes (see §10).

### 5.2 Webhook delivery format

The publisher MUST `POST` the following payload to the `delivery_url`:

```http
POST https://agent.example.com/hooks/eep
Content-Type: application/json
webhook-id: msg_01HN3QK7GX
webhook-timestamp: 1708123456
webhook-signature: v1,base64EncodedHMACSHA256Signature
EEP-Version: 0.1

{
  "specversion": "1.0",
  "id": "01HN3QK7GX-1708123456000",
  "source": "did:web:example.com:u:acme-corp",
  "type": "com.example.entity.updated",
  "time": "2026-02-22T14:30:00Z",
  "datacontenttype": "application/json",
  "eep_version": "0.1",
  "eep_subscription_id": "sub_01HN3QK7GX",
  "data": {
    "entity_id": "acme-corp",
    "field": "bio",
    "previous": "Old bio",
    "current": "New bio"
  }
}
```

### 5.3 Webhook signature verification

The `webhook-signature` header contains an HMAC-SHA256 signature over the concatenation of:
```
{webhook-id}.{webhook-timestamp}.{raw-body}
```

The key is the `delivery_secret` established at subscription time.

**Receiving platforms MUST:**
1. Verify the signature using `crypto.timingSafeEqual()` (or equivalent constant-time comparison) to prevent timing attacks.
2. Compare buffers of equal length only. `crypto.timingSafeEqual()` **throws** when its arguments differ in length, so implementations MUST check the length first and return a verification failure — never propagate the exception. A caller that omits this check turns an attacker-supplied truncated `webhook-signature` into an unhandled error rather than an authentication failure.
3. Accept a `webhook-signature` header carrying **multiple** space-delimited signatures (`v1,<sigA> v1,<sigB>`) and treat the request as verified if **any** of them matches. Publishers send more than one signature while rotating a `delivery_secret`; a receiver that parses only the first value rejects valid traffic for the duration of every rotation.
4. Reject requests where the `webhook-timestamp` is more than **60 seconds** in the past or future to prevent replay attacks.
5. Return HTTP `200` within 10 seconds, or the publisher will treat the delivery as failed.

**Example verification (Node.js):**
```typescript
import { createHmac, timingSafeEqual } from 'crypto';

const TOLERANCE_SECONDS = 60;

function verifyWebhook(
  rawBody: string,
  webhookId: string,
  webhookTimestamp: string,
  webhookSignature: string,
  secret: string
): boolean {
  // 1. Reject stale or future-dated deliveries (replay protection).
  const timestamp = Number.parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  const age = Math.floor(Date.now() / 1000) - timestamp;
  if (Math.abs(age) > TOLERANCE_SECONDS) return false;

  // 2. Compute the expected signature over the RAW body bytes.
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = Buffer.from(
    `v1,${createHmac('sha256', secret).update(signedContent, 'utf8').digest('base64')}`
  );

  // 3. Compare against every offered signature. The length guard is
  //    required: timingSafeEqual throws a RangeError on a length
  //    mismatch, which would surface as a 500 instead of a 401.
  for (const candidate of webhookSignature.split(' ')) {
    const incoming = Buffer.from(candidate);
    if (incoming.length === expected.length && timingSafeEqual(incoming, expected)) {
      return true;
    }
  }

  return false;
}
```

> The reference implementation of this algorithm is
> [`@eep-dev/signer`](https://www.npmjs.com/package/@eep-dev/signer) (`EEPSigner.verify`)
> and its Python sibling `eep-signer`. Prefer importing it over
> re-implementing the comparison by hand.

### 5.4 Retry policy (exponential backoff)

If a webhook delivery fails (non-2xx response or timeout), the publisher MUST retry with exponential backoff:

| Attempt | Delay | Max Total Time |
|---------|-------|----------------|
| 1 | Immediate | — |
| 2 | 5 seconds | 5s |
| 3 | 30 seconds | 35s |
| 4 | 2 minutes | ~2m35s |
| 5 | 15 minutes | ~17m35s |
| 6 | 1 hour | ~1h17m |
| 7 | 6 hours | ~7h17m |

After 5 consecutive failures, the subscription MUST switch to `paused` and notify the subscriber.

---

## 6. Layer 3: network pulse (WebSockets)

Network pulse handles bidirectional, interactive scenarios.

### 6.1 Connection establishment

```
GET /eep/pulse
Upgrade: websocket
Authorization: Bearer {API_KEY}
```

### 6.2 Message format

All messages are JSON with a `type` and `action` envelope:
```json
{
  "v": 1,
  "type": "entity | a2a | system | chat | commerce",
  "action": "specific-action",
  "seq": 12345,
  "data": {}
}
```

The `v` field denotes the protocol version. Clients MUST disconnect if they receive an unsupported version.

### 6.3 Message ordering across servers

Cross-server messages (routed via Redis pub/sub) do not guarantee in-order delivery. Each message MUST include a monotonic `seq` field per channel. If a gap is detected, the client MUST request a replay:

```json
{ "v": 1, "type": "system", "action": "replay", "data": { "from_seq": 12340 } }
```

### 6.3.1 Replay retention bounds (normative)

`system`/`replay` catch-up is **not** an infinite server-side log. Publishers MUST cap how much per-channel history they retain for replay (message count and/or maximum age of the earliest retained `seq`). This complements slow-consumer close code `4000` (Whitepaper §13.6): back-pressure avoids unbounded RAM during live delivery; retention caps avoid unbounded replay work after reconnects.

**Manifest fields (SHOULD):** publishers SHOULD advertise limits in `/.well-known/eep.json`:

| Field | Type | Meaning |
|-------|------|---------|
| `pulse_replay_max_messages` | integer | Maximum number of past messages retained per channel for replay. |
| `pulse_replay_max_age_seconds` | integer | Maximum age of the earliest retained `seq` relative to wall clock. |

**Behavior:** if a client requests `from_seq` older than the retained window, the server MUST NOT fabricate history. It MUST close with code `4009` (replay window exceeded) or return an explicit `system` error envelope with the same semantics so clients snapshot or reconcile from Layer 1 instead of assuming unbounded buffers.

### 6.4 JWT re-authentication

JWT tokens can expire during long-lived connections. The protocol uses a re-authentication flow:

```
Server → Client: { "type": "system", "action": "auth_expiring", "data": { "expires_in": 300 } }
Client → Server: { "type": "system", "action": "auth_refresh", "data": { "token": "new-jwt" } }
Server → Client: { "type": "system", "action": "auth_refreshed", "data": { "expires_at": "..." } }
```

If the client fails to refresh within 60 seconds, the server MUST close the connection with code `4001`.

### 6.5 WebSocket close codes

EEP defines the following application-level WebSocket close codes (4000-range). Implementations MUST use these codes consistently to allow agents to distinguish error types without parsing error messages:

| Code | Name | Meaning |
|---|---|---|
| `4000` | Back-pressure / Slow consumer | The subscriber is consuming messages too slowly. The publisher terminated the connection rather than buffering indefinitely. Per Whitepaper §13.6. The agent SHOULD reconnect with a slower subscription filter or reduce its subscription scope. |
| `4001` | Session expired | The agent's session token or API key expired and was not refreshed within the grace period. The agent MUST re-authenticate from scratch. |
| `4002` | Version mismatch | The client sent a message with a `v` field the server does not support. The agent MUST negotiate a supported version using the `eep_versions` manifest field. |
| `4003` | Nonce expired / Replay detected | The nonce in the agent's authentication message was already consumed or the `iat` window (60 seconds) was exceeded. The agent MUST obtain a new nonce and retry. |
| `4008` | Invalid negotiation transition | The agent attempted an illegal commerce state machine transition (e.g., `bid` after `close`). The agent MUST reset its local state and re-open a new RFP. |
| `4009` | Replay window exceeded | The client requested a `system`/`replay` `from_seq` (or equivalent) older than the publisher's retained history (see §6.3.1). The agent MUST reconcile from Layer 1 state or a durable client snapshot; the server does not hold an unbounded log. |

### 6.6 Chat messages

The `chat` message type enables persistent messaging between authenticated users and entity owners. Messages are stored in PostgreSQL and fanned out via Redis pub/sub.

**Actions:**

| Action | Direction | Description |
|--------|-----------|-------------|
| `send` | Client → Server | Send a message (max 4096 chars). Server persists and broadcasts. |
| `history` | Client → Server | Request message history with cursor-based pagination (max 100 per page). |
| `read` | Client → Server | Mark messages as read by message ID or mark all as read for an entity. |

```json
// Send
{ "v": 1, "type": "chat", "action": "send", "data": { "entity_did": "...", "message": "Hello" } }

// History (cursor pagination)
{ "v": 1, "type": "chat", "action": "history", "data": { "entity_did": "...", "limit": 50, "before": "msg_id" } }

// Mark as read
{ "v": 1, "type": "chat", "action": "read", "data": { "entity_did": "...", "message_id": "msg_id" } }
```

---

## 7. Event envelope format

All EEP events MUST be valid CloudEvents v1.0.2 envelopes with EEP-specific extensions:

```json
{
  "specversion": "1.0",
  "id": "unique-event-id",
  "source": "did:web:example.com:u:acme-corp",
  "type": "com.example.entity.updated",
  "time": "2026-02-22T14:30:00Z",
  "datacontenttype": "application/json",
  "eep_version": "0.1",
  "eep_subscription_id": "sub_01HN3QK7GX",
  "eep_trust_score": 87,
  "eep_actor_type": "human | agent | system | cron",
  "data": {}
}
```

**EEP extension attributes:**

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `eep_version` | string | MUST | EEP spec version that generated this event |
| `eep_subscription_id` | string | SHOULD | ID of the subscription this was delivered to |
| `eep_trust_score` | integer | SHOULD | Snapshot of entity's trust score at event time |
| `eep_actor_type` | string | SHOULD | Who triggered the event (human/agent/system/cron) |
| `eep_reputation_score` | integer | MAY | On-chain ERC-8004 reputation score at event time (0–100) |
| `eep_on_chain_did` | string | MAY | On-chain DID linked to the entity (e.g. via ERC-8004 NFT token) |

---

## 8. Event type naming convention

EEP event types follow a reverse-domain dot notation pattern:

```
{reverse-domain}.{entity-type}.{action}
{reverse-domain}.{entity-type}.{sub-domain}.{action}
```

**Structure:**
- `{reverse-domain}`: The publisher's domain in reverse (e.g., `com.example` for `example.com`)
- `{entity-type}`: The noun affected (`entity`, `trust`, `content`, `connection`, `agent`)
- `{action}`: The verb (`created`, `updated`, `deleted`, `changed`, `published`)

**Examples:**
- `com.example.entity.updated` — entity update event from a publisher at `example.com`
- `com.acme.product.price_changed` — product price change event from `acme.com`

**Wildcard matching:**
- `com.example.entity.*` matches all entity events from example.com
- `com.example.*` matches all events from example.com
- `*.entity.updated` is NOT supported (prefix matching only)

---

## 9. Standard event catalog

### Entity lifecycle
| Event Type | Description |
|------------|-------------|
| `com.example.entity.created` | A new entity profile was created |
| `com.example.entity.updated` | One or more profile fields changed |
| `com.example.entity.deleted` | An entity was permanently deleted |
| `com.example.entity.activated` | A deactivated entity was reactivated |
| `com.example.entity.deactivated` | An entity was temporarily deactivated |

### Trust and identity
| Event Type | Description |
|------------|-------------|
| `com.example.trust.changed` | Trust score changed (includes `previous` and `current`) |
| `com.example.trust.signal.added` | A positive or negative trust signal was recorded |
| `com.example.identity.verified` | Domain, email, or credential verification completed |
| `com.example.identity.did_updated` | The entity's DID document updated |

### Content
| Event Type | Description |
|------------|-------------|
| `com.example.content.published` | A new page or post was published |
| `com.example.content.updated` | Existing content was modified |
| `com.example.content.deleted` | Content was deleted |

### Connections
| Event Type | Description |
|------------|-------------|
| `com.example.connection.followed` | An entity gained a new follower |
| `com.example.connection.unfollowed` | A follower disconnected |

### Agent events
| Event Type | Description |
|------------|-------------|
| `com.example.agent.access.read` | An AI agent read this entity's profile |
| `com.example.agent.access.search` | An AI agent found this entity via search |
| `com.example.agent.task.received` | An A2A task was submitted to this entity |
| `com.example.agent.task.completed` | An A2A task completed successfully |
| `com.example.agent.task.failed` | An A2A task failed |

### Commerce and marketplace
| Event Type | Description |
|------------|-------------|
| `com.example.commerce.offer` | A new price offer was made |
| `com.example.commerce.counter` | A counter-offer was made |
| `com.example.commerce.accepted` | A negotiation was accepted |
| `com.example.commerce.rejected` | A negotiation was rejected |
| `com.example.commerce.invoiced` | An invoice was generated |
| `com.example.commerce.paid` | Payment was confirmed |
| `com.example.commerce.completed` | A commerce transaction completed |
| `com.example.commerce.disputed` | A dispute was raised |
| `com.example.service.listed` | A new service was published |
| `com.example.service.updated` | A service listing was updated |
| `com.example.service.delisted` | A service was removed |
| `com.example.gate.config_changed` | Gate configuration was updated |
| `com.example.gate.access_granted` | An agent was granted access to a new tier |
| `com.example.session.revoked` | Publisher revoked an active subscriber session |

---

## 10. Subscription lifecycle

```
POST /subscribe
      │
      ▼
  [pending_verification]
      │
      │ Publisher sends GET challenge to delivery_url
      ▼
  [Challenge Response from Subscriber]
      │
   Success ──────────────────► [active]
      │                             │
   Failure                   event delivery
      ▼                             │
  [rejected]             5 consecutive failures
                                    ▼
                              [paused]
                                    │
                          POST /subscriptions/:id/resume
                                    ▼
                              [active]
```

### WebSub intent verification

When creating a webhook subscription, the publisher MUST perform intent verification:

1. Publisher sends a `GET` request to `delivery_url` with query string:
   ```
   ?hub.mode=subscribe
   &hub.topic=did:web:example.com:u:acme-corp
   &hub.challenge=random_secure_string_32_chars
   &hub.lease_seconds=2592000
   ```

2. The subscriber endpoint MUST respond with HTTP `200` and a body containing perfectly matched `hub.challenge` value.

3. If the subscriber does not respond within 10 seconds, the subscription changes to `rejected`.

Intent verification prevents malicious actors from registering unauthorized URLs to bounce traffic through the publisher.

---

## 11. Authentication and authorization

### API key authentication
Subscription endpoints require an API key:
```http
Authorization: Bearer {API_KEY}
```

### Scopes

| Scope | Description |
|-------|-------------|
| `read:subscriptions` | List own subscriptions |
| `write:subscriptions` | Create and manage subscriptions |
| `read:events` | Access the SSE stream |
| `read:gates` | Read gate configurations |
| `write:gates` | Modify gate configurations |
| `commerce:negotiate` | Participate in commerce negotiations |
| `read:services` | Browse service listings |
| `write:services` | Publish and manage service listings |
| `write:reviews` | Submit service reviews |

### Public events vs. private events

Events can have access control:
- **Public events** (like `entity.updated` on a public profile) can be accessed by any authenticated subscriber.
- **Private events** (like agent access analytics) require the subscriber to be the entity owner.

### 11.5 Proof-of-Intent (PoI)

PoI is a defence mechanism against two AI-specific attack classes:

- **Confused Deputy**: an agent is tricked into using its elevated privileges to perform an action on behalf of a malicious second party.
- **Logic Prompt Control Injection (LPCI)**: injected prompts cause the agent to take actions outside the scope that the human operator intended.

For commerce transactions above a configurable threshold, or any resource marked as `high_risk`, publishers SHOULD require a `proof_of_intent` gate proof.

#### Intent Document

```json
{
  "type": "proof_of_intent",
  "intent_document": {
    "intent_id": "intent_01HXK",
    "agent_did": "did:web:my-agent.example.com",
    "principal_did": "did:web:alice.example.com",
    "action": "Purchase Bloomberg financial data feed — daily briefing",
    "scope": {
      "max_amount": 250,
      "currency": "USDC",
      "allowed_resources": ["data.finance.*", "events.market.*"],
      "expires_at": "2026-03-05T06:00:00Z"
    },
    "principal_signature": "0xdeadbeef...",
    "created_at": "2026-03-05T05:00:00Z"
  }
}
```

**Structural validation** (protocol-level, implemented by `@eep-dev/gates` `poi-validator.ts`):
- All required fields present
- `agent_did` matches the requesting agent's authenticated DID
- `scope.expires_at` is in the future (not expired)
- `created_at` is not in the future (replay protection)
- `principal_signature` is a valid hex or base64 signature string

**Semantic validation** (platform-level):
- Verify the `principal_signature` against the `principal_did`'s DID Document public key
- Confirm `scope.max_amount` and `allowed_resources` cover the current request

#### Scope Checking

Before executing any high-risk action, the publisher MUST check that both the `resource` and `amount` (if applicable) fall within the PoI scope using the `isWithinScope()` function from `@eep-dev/gates`.

| Check | Failure Behaviour |
|-------|------------------|
| `resource` not in `allowed_resources` | Return 403 with `unmet: proof_of_intent` |
| `amount > max_amount` | Return 402 with `unmet: proof_of_intent` |
| PoI expired | Return 401 with `error: intent_expired` |

### 11.6 Post-Quantum Cryptography (PQC) Readiness

EEP nodes that advertise `pqc_ready: true` in their `/.well-known/eep.json` manifest MUST support at least one of the NIST FIPS 203/204/205 primitive sets:

| NIST Standard | Algorithm | Use |
|---------------|-----------|-----|
| FIPS 203 | ML-KEM-768 | Key encapsulation / TLS hybrid |
| FIPS 204 | ML-DSA-65 | Digital signatures |
| FIPS 205 | SLH-DSA-128s | Hash-based signatures (stateless) |

Nodes SHOULD advertise supported algorithms in the `pqc_algorithms` array of the manifest. Nodes that are not yet PQC-ready MUST set `pqc_ready: false` (not omit the field).

### 11.7 Signing Algorithm Negotiation (Crypto-Agility)

EEP is designed for a protocol lifetime exceeding a decade. To avoid a hard migration cutover when PQC algorithms become mandatory, EEP supports **signing algorithm negotiation** per Whitepaper §13.11.

Publishers declare their supported signing algorithms in the `signing_algorithms` array of their `/.well-known/eep.json` manifest, in order from most preferred to least preferred:

```json
{
  "signing_algorithms": [
    "hybrid-EdDSA-ML-DSA-65",
    "EdDSA",
    "ES256K"
  ]
}
```

**Negotiation rules:**

1. When an agent submits a proof, it MUST sign using the **strongest mutually supported algorithm**: the publisher's highest-preference algorithm that the agent also supports.
2. If the agent cannot support any algorithm in the publisher's list, it MUST abort and return a descriptive error rather than sending an unverifiable proof.
3. Publishers MUST verify only the algorithm they selected (reject proofs signed with unlisted algorithms).
4. If `signing_algorithms` is absent from the manifest, agents MUST default to `EdDSA` (Ed25519).

**Algorithm identifiers** (valid `signing_algorithms` values):

| Identifier | Algorithm | Standard |
|---|---|---|
| `EdDSA` | Ed25519 | RFC 8037 |
| `ES256K` | secp256k1 ECDSA | RFC 8812 |
| `ES256` | P-256 ECDSA | RFC 7518 |
| `ML-DSA-65` | CRYSTALS-Dilithium Level 3 | FIPS 204 |
| `ML-DSA-87` | CRYSTALS-Dilithium Level 5 | FIPS 204 |
| `SLH-DSA-128s` | SPHINCS+-SHA2-128s | FIPS 205 |
| `hybrid-EdDSA-ML-DSA-65` | Ed25519 + ML-DSA-65 (dual signature) | FIPS 204 + RFC 8037 |
| `hybrid-EdDSA-ML-DSA-87` | Ed25519 + ML-DSA-87 (dual signature) | FIPS 204 + RFC 8037 |

**Hybrid signatures:** When both `EdDSA` and `ML-DSA` are present in the same signed payload, the proof object carries both `proofValue` (EdDSA) and `mldsaProofValue` (ML-DSA). Either individual signature is valid for classical verifiers; post-quantum verifiers MUST validate both. This enables incremental migration without a flag-day switchover.

```json
{
  "type": "DataIntegrityProof",
  "cryptosuite": "hybrid-eddsa-mldsa-2022",
  "verificationMethod": "did:web:agent.example.com#key-1",
  "proofPurpose": "assertionMethod",
  "proofValue": "z3K2nRgW...",
  "mldsaProofValue": "zABC123..."
}
```

**Resource-constrained agents (IoT / embedded):** hybrid proofs increase CPU time and payload size versus EdDSA-only. Such deployments SHOULD default to classical algorithms for routine traffic and use PQ-hybrid only where policy or tier requires it (Whitepaper §13.11).

### 11.8 DID resolution caching and resolver outages

DID methods that resolve over HTTPS (e.g. `did:web`) depend on infrastructure that can be temporarily unavailable.

**Caching:** implementations MAY cache resolved DID Documents. Cache entries MUST have a bounded TTL (`did_cache_ttl_seconds` in operator policy or manifest metadata). Cached documents MUST NOT bypass revocation: before accepting high-assurance gate proofs, publishers SHOULD refresh when the cache age exceeds policy.

**Resolver failure:** if authoritative resolution fails and freshness cannot be established, implementations SHOULD **fail closed** (reject the proof) for high-assurance gates rather than accept possibly stale keys. Low-risk surfaces MAY retry with exponential backoff per operator policy.

---

## 12. Discovery

**Informative (non-normative):** Classic web discovery for crawlers often uses HTML links and XML `sitemap.xml` to enumerate URLs. The EEP manifest at `/.well-known/eep.json` is a **machine-readable declaration of protocol surfaces** (DIDs, layers, gates, content negotiation), complementary to sitemaps rather than a drop-in replacement. Retrieval-oriented and publisher strategy context (including GEO as discussed in research and industry reporting) is documented in [`WHITEPAPER.tex`](../WHITEPAPER.tex), Section 4 (*Discovery and the EEP Registry*).

Subscribers discover EEP endpoints through three mechanisms:

### 12.1 HTTP link header (primary)
Every entity resolution response MUST include:
```http
Link: <https://api.example.com/eep/subscribe>; rel="subscribe"
Link: <https://api.example.com/eep/stream?source=acme-corp>; rel="monitor"
```

### 12.2 Agent card extension (A2A v0.3 + W3C ANP)
The entity's A2A agent card MUST include the `x-eep` extension. Fields marked **SHOULD** improve discoverability by W3C AI Agent Protocol (ANP) clients and EU AI Act compliance tooling:

```json
{
  "x-eep": {
    "subscribe_url": "https://api.example.com/eep/subscribe",
    "stream_url": "https://api.example.com/eep/stream",
    "source_did": "did:web:example.com:u:acme-corp",
    "supported_events": ["com.example.entity.*", "com.example.trust.*"],
    "anp_compatible": true,
    "dpv_purpose": "https://w3id.org/dpv#ServiceProvision",
    "dpv_retention": "https://w3id.org/dpv#TemporalDuration"
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `subscribe_url` | MUST | Webhook subscription endpoint |
| `stream_url` | MUST | SSE stream URL |
| `source_did` | MUST | Entity's DID |
| `supported_events` | SHOULD | Supported event type patterns |
| `anp_compatible` | SHOULD | W3C ANP semantic compatibility flag |
| `dpv_purpose` | SHOULD | W3C DPV data processing purpose URI |
| `dpv_retention` | SHOULD | W3C DPV data retention policy URI |

### 12.3 Well-known document

```
GET /.well-known/eep.json
```

Returns the platform-level EEP capabilities document conforming to `schemas/v0.1/eep-manifest.json`.

**Example manifest:**

```json
{
  "did": "did:web:api.example.com:u:acme-corp",
  "eep_version": "0.1",
  "layers": {
    "layer1": "https://api.example.com/u/acme-corp",
    "layer2_sse": "https://api.example.com/eep/stream",
    "layer2_webhook": "https://api.example.com/eep/subscribe",
    "layer3_ws": "wss://api.example.com/eep/pulse"
  },
  "supported_content_types": ["application/json", "text/markdown", "text/toon"],
  "gates_url": "https://api.example.com/eep/gates/did:web:api.example.com:u:acme-corp",
  "services_url": "https://api.example.com/eep/services/did:web:api.example.com:u:acme-corp",
  "capabilities_query_url": "https://api.example.com/eep/capabilities/did:web:api.example.com:u:acme-corp",
  "reputation": {
    "contract": "0xC5a3dD3EF9b961c5c52218af7023e6F7A5e2e67F",
    "chain": "ethereum",
    "scan_url": "https://8004scan.io/0xC5a3dD3EF9b961c5c52218af7023e6F7A5e2e67F"
  },
  "pqc_ready": false,
  "pqc_algorithms": [],
  "x402_enabled": true,
  "x402": {
    "facilitator_url": "https://x402.org/facilitator",
    "payment_rails": ["x402/usdc"],
    "network": "base"
  },
  "compliance": {
    "eu_ai_act": true,
    "gdpr": true,
    "anp_compatible": true,
    "dpv_purpose": "https://w3id.org/dpv#ServiceProvision"
  },
  "updated_at": "2026-03-05T05:00:00Z"
}
```

### 12.4 Dynamic Capability Discovery

For entities with large data catalogs or frequently changing capabilities, static manifests become stale. Publishers MAY expose a paginated capability query endpoint:

```
GET /.well-known/eep.json/capabilities
  ?query=financial+data
  &category=finance
  &gate_type=payment
  &page=1
  &limit=20
```

The URL is advertised in the manifest's `capabilities_query_url` field.

**Response format:**

```json
{
  "items": [
    {
      "id": "cap_bloomberg_daily",
      "name": "Bloomberg Daily Briefing",
      "category": "finance",
      "gate_types": ["payment", "credential"],
      "access_patterns": ["data.finance.bloomberg.*"]
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 20,
  "next_page_url": "https://api.example.com/eep/capabilities/acme-corp?page=2&limit=20"
}
```

This allows agents to search for specific capabilities without downloading the entire catalog.

---

## 13. Rate limiting

Publishers MUST enforce rate limits and return standard headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1708168200
Retry-After: 120
```

Recommended default limits per subscriber:

| Action | Limit |
|--------|-------|
| Subscription creation | 100/day |
| SSE connections | 5 concurrent |
| Webhook deliveries received | 10,000/day |
| Event stream history queries | 60/hour |

### 13.1 Cold-start DID trust progression (normative)

New or unproven DIDs start in a **restricted** rate bucket (tighter limits, optional proof-of-payment or proof-of-work challenge on `429` responses via `X-EEP-RL-Challenge`). Agents MAY graduate to standard limits by:

1. **Proof-of-payment:** Successful micropayment or stake tied to the DID (recorded in audit or on-chain reputation).
2. **Genesis proof:** Verifiable completion of a registry- or publisher-issued challenge (VC attestation `EEPColdStartGraduation` or equivalent).
3. **Trust Anchor VC:** Presentation of a valid trust credential from a federated registry.

Publishers SHOULD document decay (e.g. trust score cooldown) and MUST NOT permanently trap good-faith agents: graduation paths MUST be machine-testable where advertised.

---

## 14. Conformance levels

EEP defines three conformance tiers aligned with Whitepaper §10.2 (Table 2). Each tier is associated with a distinct **EEP Conformance Credential** type issued by `eep.dev`'s DID. Agents MUST only filter by conformance level after verifying the credential's `proof` and `validUntil`.

### 14.1 Core

Suitable for: read-only publishers, IoT sensors, knowledge bases.

- [x] `/.well-known/eep.json` manifest endpoint (must pass schema validation against `eep-manifest.json`)
- [x] Layer 1 REST state endpoint with `Accept` header content negotiation (JSON, Markdown, TOON)
- [x] `rel="subscribe"` Link header on all Layer 1 responses
- [x] Layer 2 SSE stream endpoint with event type filtering (`?events=type1,type2`)
- [x] `Last-Event-ID` replay with a minimum 24h event retention window
- [x] CloudEvents v1.0 envelope format on all emitted events
- [x] EEP extension attributes (`eep_version`, `eep_subscription_id`) on all emitted events
- [x] Rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `Retry-After`) on all responses
- [x] Discovery via HTTP `Link` headers and/or DNS TXT record `_eep.<domain>`

**Credential type:** `EEPConformanceCredential_Core`

---

### 14.2 Standard

Superset of Core. Suitable for: B2B data APIs, financial feeds, subscription services.

- [x] All Core requirements above, plus:
- [x] Webhook subscription endpoint (`POST /eep/subscribe`) with full lifecycle (create/pause/resume/delete)
- [x] WebSub intent verification before activating any webhook subscription
- [x] HMAC-SHA256 signature on all webhook deliveries (Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature` per §5)
- [x] Exponential backoff retry policy for failed webhook deliveries (min 5 attempts, max 24h window)
- [x] `credential` gate: W3C VC 2.0 presentation verification from named issuer DID
- [x] `payment` gate: on-chain transaction hash verification with configurable confirmation threshold
- [x] `identity` gate: DID ownership proof challenge-response
- [x] HTTP `402 Payment Required` structured response (`gate.402-response.json`)
- [x] HTTP `403 Forbidden` structured response (`gate.403-response.json`)
- [x] HTTP `451 Unavailable For Legal Reasons` structured response (`gate.451-response.json`)
- [x] Version negotiation: `EEP-Version` request/response headers + HTTP 505 fallback
- [x] Session tokens (signed JWT-like) with `exp`, `refresh_threshold`, `context_id` per §6
- [x] `ERC-8004` reputation field in `/.well-known/eep.json` manifest (optional; SHOULD for on-chain entities)
- [x] x402 payment rail support in `PaymentRequirement.x402` and `PaymentProof.x402_payload`
- [x] PQC readiness declaration (`pqc_ready` + `pqc_algorithms`) in manifest
- [x] `signing_algorithms` field in manifest declaring supported DID signing algorithms (crypto-agility)

**Credential type:** `EEPConformanceCredential_Standard`

---

### 14.3 Full

Superset of Standard. Suitable for: agent commerce platforms, regulated industries, multi-party data exchanges.

- [x] All Standard requirements above, plus:
- [x] Layer 3 WebSocket endpoint with `type`/`action`/`seq` JSON envelope format
- [x] JWT re-authentication in WebSocket connections (session token presented on upgrade)
- [x] Commerce message type (`commerce.*`) in WebSocket with full state machine enforcement
  - [x] `offer → counter → accept → invoice → paid` transitions validated
  - [x] `commerce.rfp.open / commerce.rfp.bid / commerce.rfp.closed` auction events via Layer 2
  - [x] Signed Allocation Receipt VC issued to winning bidder
- [x] Negotiation state machine enforcement (invalid transitions return `4008` close code)
- [x] `agreement` gate: EdDSA signature over SHA-256 document hash verified as Verifiable Presentation
- [x] `data_request` gate: W3C DPV purpose declaration + specific named claims + `retention_days`
- [x] `combined` gate: AND/OR logic across any combination of gate types
- [x] Session persistence: `Last-Event-ID` associated per session token for zero-loss reconnect
- [x] `session.revoked` event emitted on active subscriber streams on publisher-initiated revocation
- [x] Proof-of-Intent (`proof_of_intent`) structural and scope validation for high-risk commerce
- [x] W3C DPV (`dpv_purpose`, `dpv_retention`) in data_request gates and Agent Card `x-eep` extension
- [x] ANP compatibility flag (`anp_compatible: true`) in Agent Card `x-eep` extension
- [x] `data.withdrawal` WebSocket message + `DELETE /data/claims/:claim_id` REST endpoint
- [x] Operator Privacy Policy Profile machine-readable schema (`operator.privacy-policy.json`)
- [x] Operator Spending Policy Profile machine-readable schema (`operator.spending-policy.json`)
- [x] Service listing endpoints (Layer 1 state + `service.listing.json` schema)
- [x] Review and rating system (aggregated rating in `service.listing.json`)
- [x] End-to-end delivery audit log API (`GET /eep/audit-log`, response: `audit-log.json`)
- [x] Cross-server message ordering via Redis pub/sub or equivalent ordered message broker
- [x] Forward Secrecy enforced for all WS/SSE connections (`forward_secrecy_enforced: true` in manifest)
- [x] mTLS support (`tls_mode: "mTLS"` or `"mTLS-required"` in manifest)

**Credential type:** `EEPConformanceCredential_Full`

---

### 14.4 EEP Conformance Credential

A publisher that passes the full conformance test suite at `eep.dev/conformance` receives a time-bounded **EEP Conformance Credential**: a W3C Verifiable Credential 2.0 issued by `did:web:eep.dev`, which can be embedded in the `/.well-known/eep.json` manifest under the `conformance_credential` field.

```json
{
  "@context": ["https://www.w3.org/ns/credentials/v2"],
  "type": ["VerifiableCredential", "EEPConformanceCredential_Full"],
  "issuer": "did:web:eep.dev",
  "validFrom": "2026-03-01T00:00:00Z",
  "validUntil": "2027-03-01T00:00:00Z",
  "credentialSubject": {
    "id": "did:web:api.example.com",
    "conformanceTier": "Full",
    "testedAt": "2026-03-01T00:00:00Z",
    "passedChecks": 47,
    "totalChecks": 47,
    "manifestUrl": "https://api.example.com/.well-known/eep.json"
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-rdfc-2022",
    "created": "2026-03-01T00:00:00Z",
    "verificationMethod": "did:web:eep.dev#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z3K2nRgWAZf..."
  }
}
```

Agents MUST verify:
1. `proof.verificationMethod` resolves to a key in `did:web:eep.dev`'s DID Document
2. `validUntil` is in the future (credential expires annually)
3. `conformanceTier` matches the tier declared in the publisher's manifest
4. The DID in `credentialSubject.id` matches the publisher's `entity_did`

See `schemas/v0.1/conformance.credential.json` for the full JSON Schema.

---

### 14.5 Audit Log Requirement (Full Tier)

Full-tier publishers MUST expose a delivery audit log endpoint:

```
GET /eep/audit-log
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `actor_did` | string | Filter by agent DID |
| `event_type` | string | Filter by audit event type |
| `from` | date-time | Start of time range (ISO8601) |
| `to` | date-time | End of time range (ISO8601) |
| `outcome` | string | `success`, `failure`, `partial`, `pending` |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Entries per page (default: 20, max: 1000) |
| `sort` | string | `desc` (default) or `asc` |

**Example response** (schema: `audit-log.json`):

```json
{
  "entries": [
    {
      "entry_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "event_type": "gate.proof.accepted",
      "actor_did": "did:web:agent.example.com",
      "publisher_did": "did:web:api.example.com",
      "timestamp": "2026-03-05T10:00:00Z",
      "outcome": "success",
      "resource": "premium",
      "gate_type": "payment",
      "nonce": "nonce_abc123",
      "signature": "z3K2nRgW...",
      "metadata": { "tx_hash": "0xdeadbeef", "chain": "base" }
    }
  ],
  "total": 142,
  "page": 1,
  "per_page": 20,
  "publisher_did": "did:web:api.example.com"
}
```

Each entry is **individually signed** by the publisher's DID key, making tampering cryptographically detectable. This satisfies:
- **DORA Art. 8** — ICT incident and event logging for financial services
- **EU AI Act Art. 12** — High-risk AI system decision logging
- **GDPR Art. 5(2)** — Accountability principle (signed exchange log as on-chain record)



### §3.4.3 Access restriction responses

Publishers use three HTTP status codes for gate failures:

| Status | Error Code | Trigger |
|--------|------------|---------|
| `402 Payment Required` | `access_restricted` | Payment gate not met |
| `403 Forbidden` | `access_forbidden` | Credential, identity, allowlist, reciprocal gate not met |
| `451 Unavailable For Legal Reasons` | `legally_restricted` | Resource restricted by law (EU AI Act, DORA, GDPR Art.17, judicial order) |

**402 Response** (`gate.402-response.json`):
```json
{
  "error": "access_restricted",
  "resource": "content.papers.full_text",
  "current_tier": "public",
  "required_tier": "academic",
  "unmet_requirements": [{"type": "credential", "resolution_hint": "AcademicAffiliation VC required"}],
  "available_tiers": { "academic": { "requirements": [...] } }
}
```

**403 Response** (`gate.403-response.json`):
```json
{
  "error": "access_forbidden",
  "resource": "analytics.agent.tracking",
  "current_tier": "public",
  "required_tier": "verified_agent",
  "unmet_requirements": [{"type": "identity", "resolution_hint": "DID verification required"}]
}
```

**451 Response** (`gate.451-response.json`):
```json
{
  "error": "legally_restricted",
  "resource": "ai.highRiskSystem.inference",
  "reason": "EU AI Act Annex III prohibits unregistered high-risk AI system access",
  "legal_basis": "EU AI Act Art. 6 Annex III",
  "jurisdiction": "EU",
  "contact": "legal@example.com"
}
```

---

## 15. Service discovery and marketplace

Entities MAY publish a **service catalog** of their offerings. The catalog is machine-readable, so agents can find, compare, and purchase services without manual browsing.

### 15.1 Service catalog endpoint

```
GET /eep/services/:entity_did
Accept: application/json
```

Returns a `service.listing.json`-conformant response with the entity's service catalog.

### 15.2 Service listing fields

Each service in the catalog includes:
- **id**: Unique service identifier (pattern: `svc_[a-zA-Z0-9_]+`)
- **name**: Human-readable name
- **category**: Freeform category string for classification
- **tags**: Entity-defined tags for search and discovery
- **pricing**: Uses the same pricing model schema as commerce negotiations
- **delivery**: How the service is delivered (`realtime`, `async`, `scheduled`, `sse`, `webhook`, `download`, `a2a_task`)
- **availability**: Schedule, slot limits, or on-demand
- **negotiable**: Whether the entity accepts counter-offers
- **gate_requirements**: Additional non-payment requirements

### 15.3 Pricing models

The protocol defines standard pricing models. Custom models use the `x-` prefix.

| Model | Description |
|-------|-------------|
| `fixed` | One-time flat price |
| `per_request` | Charge per API request |
| `per_event` | Charge per event delivered |
| `subscription` | Recurring charge with a billing period |
| `metered` | Usage-based billing (rate × units consumed) |
| `tiered_volume` | Volume discounts with tier brackets |
| `free` | No charge |
| `x-*` | Custom pricing models |

### 15.4 Commerce negotiation

When a service has `negotiable: true`, agents can negotiate pricing over the WebSocket `commerce` message type. The negotiation follows a state machine:

```
offer → [open] → counter → [countered] → accept → [accepted]
                                        → reject → [rejected]
                         → expire  → [expired]

[accepted] → invoice → [invoiced] → receipt → [paid] → complete → [completed]

Any active state → dispute → [disputed] → accept/reject/complete
```

Terminal states: `rejected`, `expired`, `completed`.

#### 15.4.1 M2M dispute resolution (normative)

After `paid` or `completed`, if the publisher fails SLA (e.g. stops streaming, withholds agreed data), the subscriber agent MAY open a dispute without human intervention where policy allows.

**Layer 3:** Publishers MUST support `commerce.dispute.open` and related `commerce.dispute.*` actions on the WebSocket envelope (see `schemas/v0.1/ws-message.json`). Payloads include `negotiation_id`, `reason_code` (machine-readable), `evidence` (hashes or URIs), and optional `requested_remedy` (`refund` \| `service_resume` \| `reputation_penalty`).

**Outcomes:** Resolution is implementation-defined on-chain or off-chain, but publishers MUST emit terminal commerce events (`commerce.dispute.resolved` with `outcome`: `refunded` \| `rejected` \| `penalty_applied` \| `dismissed`) and SHOULD adjust publisher trust score or escrow release per `terms.sla` when present.

### 15.5 Reviews

After a transaction completes, subscribers MAY leave a review:
- **score**: 1-5 integer
- **comment**: Optional text (max 2048 chars)
- **reviewer_did**: DID of the reviewing agent

Reviews are collected into a `rating` object on the service listing.

---

## 16. Compliance and Audit Trails

EEP publishers serving regulated environments (EU AI Act, DORA, GDPR) SHOULD expose a compliance audit log endpoint. The log provides a cryptographically verifiable record of all agent interactions.

### 16.1 Audit log endpoint

```
GET /eep/audit
  ?entity_did=did:web:example.com:u:acme-corp
  &from=2026-03-01T00:00:00Z
  &to=2026-03-05T23:59:59Z
  &type=agent.access&type=commerce.paid
  &page=1
  &limit=100
Authorization: Bearer {OWNER_API_KEY}
```

**Response:**

```json
{
  "entries": [
    {
      "entry_id": "audit_01HXK",
      "timestamp": "2026-03-05T05:00:00Z",
      "entity_did": "did:web:example.com:u:acme-corp",
      "actor_did": "did:web:my-agent.example.com",
      "actor_type": "agent",
      "event_type": "com.example.commerce.paid",
      "resource": "services.consultation_30",
      "tier": "premium",
      "amount": 75,
      "currency": "USDC",
      "outcome": "success",
      "signature": "base64EncodedEd25519Signature"
    }
  ],
  "total": 2341,
  "page": 1,
  "limit": 100
}
```

### 16.2 Entry signing

Each audit entry MUST be signed by the publisher using an Ed25519 key. The signature covers the concatenation of:

```
{entry_id}.{timestamp}.{entity_did}.{actor_did}.{event_type}.{outcome}
```

This allows auditors (compliance officers, EU AI Act notified bodies) to verify the log has not been tampered with.

### 16.3 Retention requirements

| Regulation | Minimum Retention |
|------------|-------------------|
| EU AI Act Art. 12 | 10 years (high-risk systems) |
| DORA Art. 9 | 5 years |
| GDPR Art. 30 | Duration of processing + 3 years |

Publishers MUST declare their retention period in the manifest's `compliance` object.

### 16.4 Regulatory Alignment Table (G23)

The following table maps EEP protocol features to **relevant building blocks** for the listed obligations. These mappings are **informational, not legal advice or a compliance certification**: an obligation is only met when the operator actually implements the feature (for example, per-entry Ed25519 audit-log signing per §16.2) and has the deployment independently verified. "Operator-verified" means the burden of proof rests on the deploying operator, not on the protocol itself.

| Regulation | EEP Feature | Relevant building block (operator-verified) |
|---|---|---|
| **EU AI Act Art. 9** (risk management) | `trust` gate, ERC-8004 reputation | Verified agent identity and behavioral scoring |
| **EU AI Act Art. 12** (record-keeping) | Audit Trail API (`GET /eep/audit`), signed log entries | Audit-log endpoint; tamper-evidence requires the operator to implement per-entry Ed25519 signing (§16.2) |
| **EU AI Act Art. 13** (transparency) | `eep.json` manifest, TOON format | Machine-readable and human-readable disclosures |
| **GDPR Art. 5** (purpose limitation) | `data_request` gate with W3C DPV purpose | Pins a declared processing purpose to each data grant |
| **GDPR Art. 7** (consent) | `data_request` gate, Operator Privacy Policy | Structured, withdrawable consent flow |
| **GDPR Art. 17** (right to erasure) | `data.withdrawal` WebSocket message | Withdrawal-request channel for data shared via `data_request` — not a general erasure mechanism; must be reconciled with the §16.3 audit-log retention period |
| **DORA Art. 9** (ICT risk) | `compliance.dora: true` flag, audit retention | Registry-level ICT-risk compliance declaration |
| **eIDAS 2.0 / EU 2024/1183** | `agreement` gate (W3C VC), Delegation Proof VC | Wallet-aligned credential stack; cross-border identity |
| **CCPA §1798.100** | Operator Privacy Policy, `data_request` gate | Agent-side privacy-preference declaration (enforcement is operator-side) |
| **W3C ANP** | `compliance.anp_compatible`, A2A `x-eep` fields | Semantic interoperability with agent network protocols |

---

## §3.1.1 Version Negotiation (G21)

Clients MUST include an `EEP-Version` header on every request:

```
EEP-Version: 0.1
```

If the server does not support the requested version, it MUST respond with HTTP **505 EEP Version Not Supported**:

```json
{
  "error": "eep_version_not_supported",
  "requested_version": "0.1",
  "supported_versions": ["1.0"],
  "preferred_version": "1.0"
}
```

Publishers declare all supported versions in `eep_versions[]` and their preference in `preferred_version` in `eep.json`.

---

## §3.4.4 `data_request` Gate Type (G13)

```json
{
  "type": "data_request",
  "requested_claims": [
    { "claim": "org_type", "required": true },
    { "claim": "industry_sector", "required": false }
  ],
  "purpose": "dpv:ResearchAndDevelopment",
  "retention_days": 30,
  "shareable": false,
  "policy_url": "https://publisher.example/privacy",
  "policy_hash": "sha256:a3b4c5..."
}
```

**Proof:** Agent submits a W3C Verifiable Presentation containing the requested claims, signed by the agent's DID key.

```json
{
  "type": "data_request",
  "verifiable_presentation": "eyJhbGciOiJFZERTQSJ9...",
  "claimed_fields": ["org_type", "industry_sector"]
}
```

**Purpose values** MUST use W3C DPV vocabulary (e.g., `dpv:ServiceProvision`, `dpv:ResearchAndDevelopment`, `dpv:Optimization`).

**Agent behavior:** Before sharing data, the agent checks its Operator Privacy Policy Profile (§10.1) to determine which claims it may share autonomously vs. which require human confirmation.

---

## §3.4.5 `agreement` Gate Type (G14)

Requires the agent to digitally sign a specific document (license agreement, ToS, data processing agreement) using EdDSA.

```json
{
  "type": "agreement",
  "document_hash": "sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb0cd4af7d9c7d72a5a",
  "document_url": "https://publisher.example/terms/v2.pdf",
  "document_title": "API Terms of Service v2.0",
  "signature_algo": "EdDSA"
}
```

**Proof:**

```json
{
  "type": "agreement",
  "document_hash": "sha256:4b227777...",
  "signature": "base64url_encoded_eddsa_signature",
  "signer_did": "did:web:agent.acme.ai",
  "signature_algo": "EdDSA"
}
```

The agent signs `document_hash` using its DID private key. Publishers MUST verify the signature using the agent's DID document verification key.

---

## §6.5.3 Auction / RFP Pricing Mode (G19)

When `pricing_mode: "auction"` in the manifest, the publisher accepts bids for time-limited resource allocations (e.g., premium compute, exclusive data access, priority API slots).

### Auction Flow

1. **Publisher** emits `commerce.rfp.open` CloudEvent with auction parameters
2. **Agents** submit bids via `commerce.rfp.bid.submit` before `close_time`
3. **Publisher** closes the auction, emits `commerce.rfp.closed` with winner info
4. **Winner** receives an **AllocationReceipt** VC granting time-bounded access

### Auction Configuration (in `commerce.negotiation` message)

```json
{
  "negotiation_id": "neg_01abc2def3",
  "service": "compute.gpu.h100",
  "pricing_mode": "auction",
  "auction": {
    "mechanism": "first_price",
    "close_time": "2026-03-06T12:00:00Z",
    "reserve_price": 50.00,
    "currency": "usd",
    "rfp_id": "rfp_01xyz789"
  }
}
```

### AllocationReceipt VC

Issued to the auction winner as a W3C Verifiable Credential:

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1", "https://eep.dev/contexts/v0.1"],
  "type": ["VerifiableCredential", "EEPAllocationReceipt"],
  "issuer": "did:web:publisher.example",
  "issuanceDate": "2026-03-06T12:01:00Z",
  "credentialSubject": {
    "id": "did:web:winner.agent.ai",
    "allocation_id": "alloc_abc123",
    "winning_bid": 75.00,
    "currency": "usd",
    "valid_from": "2026-03-06T12:01:00Z",
    "valid_until": "2026-03-07T12:01:00Z"
  },
  "proof": { "type": "Ed25519Signature2020", "verificationMethod": "did:web:publisher.example#key-1", "proofValue": "z..." }
}
```

---

## §9.x Data Withdrawal Events (G17)

### `data.withdrawal.requested`

Emitted by the agent via WebSocket `action: data_withdrawal`:

```json
{
  "v": 1,
  "type": "a2a",
  "action": "data_withdrawal",
  "data": {
    "claim_id": "claim_abc123",
    "agent_did": "did:web:agent.acme.ai",
    "reason": "dpv:WithdrawConsent",
    "signed_request": "base64url_eddsa_signature"
  }
}
```

### `data.withdrawal.confirmed`

Publisher acknowledges the withdrawal within 24h (GDPR Art. 17 compliance):

```json
{
  "v": 1,
  "type": "system",
  "action": "event",
  "data": {
    "event_type": "data.withdrawal.confirmed",
    "claim_id": "claim_abc123",
    "deleted_at": "2026-03-05T12:00:00Z"
  }
}
```

**REST alternative:** `DELETE /data/claims/:claim_id` with bearer token returns `204 No Content` or `202 Accepted` (async deletion).

---

## §10.1 Operator Policy Profiles (G18)

See full guide: [`docs/guides/OPERATOR-POLICY-PROFILES.md`](../guides/OPERATOR-POLICY-PROFILES.md)

**Privacy Policy Profile** — Controls which claims the agent may share autonomously vs. requiring human confirmation. Signed by `operator_did`.

**Spending Policy Profile** — Defines per-transaction, per-hour, and per-day spending limits; approved chains; minimum recipient conformance level. Signed by `operator_did`.

Both profiles are stored locally by the agent and consulted before any gate interaction.

---

## §11.7 Session Token / EEP-Session Header (G15)

After meeting gate requirements, the publisher issues a **Session Token** — a signed JSON document that caches the agent's access grant.

**Token structure** (schema: `schemas/v0.1/session.token.json`):

```json
{
  "agent_did": "did:web:agent.acme.ai",
  "issuer_did": "did:web:publisher.example",
  "tiers": ["pro", "api_v2"],
  "iat": 1741219200,
  "exp": 1741305600,
  "refresh_threshold": 1741302000,
  "context_id": "ctx_a1b2c3d4",
  "gate_version": "2026-03-01",
  "signature": "EdDSA_base64url_signature"
}
```

**Usage:** Agents present the encoded token in subsequent requests:

```
Authorization: EEP-Session <base64url_token>
```

**Renewal:** When the current timestamp exceeds `refresh_threshold`, agents SHOULD proactively request a new token. Publishers MUST reject tokens where `exp` has passed.

---

## §11.8 Delegation Proof Verifiable Credential (G16)

Delegation Proofs allow an owner DID to authorize an agent DID to act on its behalf within explicit scope constraints.

**Credential structure** (schema: `schemas/v0.1/delegation.proof.json`):

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1", "https://eep.dev/contexts/v0.1"],
  "type": ["VerifiableCredential", "EEPDelegationProof"],
  "issuer": "did:web:owner.acme.ai",
  "issuanceDate": "2026-03-01T00:00:00Z",
  "expirationDate": "2026-04-01T00:00:00Z",
  "credentialSubject": {
    "id": "did:web:agent.bot.ai",
    "permitted_actions": ["gate:payment", "subscribe:sse"],
    "permitted_endpoints": ["https://api.publisher.example/*"],
    "max_payment_amount": 100.00,
    "currency_code": "USD",
    "operator_privacy_policy_hash": "sha256:...",
    "allowed_dpv_purposes": ["dpv:ServiceProvision"],
    "max_retention_days": 30
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:web:owner.acme.ai#key-1",
    "proofValue": "z..."
  }
}
```

**Privacy propagation:** Sub-agents MUST remain cryptographically bound to the delegator's **Operator Privacy Policy** (or equivalent). Delegation VCs MUST include `operator_privacy_policy_hash` (SHA-256 of the canonical policy document) and SHOULD include `allowed_dpv_purposes` and `max_retention_days`. When evaluating `data_request` gates for a delegated agent, publishers MUST verify that requested claims and DPV purposes are a subset of the delegation's allowed set; otherwise the proof MUST be rejected.

**Security:** Publishers MUST verify the delegation VC signature AND check `expirationDate` before accepting a delegated agent. Delegation VCs without explicit `permitted_actions` MUST be rejected.

---

## §12.3.1 Extended Manifest Fields (G21/G22)

The following fields are available in `eep.json` in addition to those defined in §12.3:

| Field | Type | Description |
|---|---|---|
| `eep_versions` | `string[]` | All EEP versions this entity supports |
| `preferred_version` | `string` | Preferred version for version negotiation |
| `data_residency` | `string` | Data residency constraint (e.g., `EU-only`, `DE`) |
| `payment_networks` | `object[]` | Multi-chain payment config: `chain`, `address`, `min_confirmations` |
| `pricing_mode` | `"fixed" \| "negotiable" \| "auction"` | Pricing discovery mode for the entity |
| `compliance.dora` | `boolean` | EU DORA (2022/2554) compliance declaration |
| `compliance.eidas2` | `boolean` | eIDAS 2.0 (EU 2024/1183) VC architecture alignment |

**Example multi-chain payment networks:**

```json
"payment_networks": [
  { "chain": "base", "address": "0xABC...123", "min_confirmations": 1 },
  { "chain": "solana", "address": "8xGt...ZkQ", "min_confirmations": 32 }
]
```

---

## §12.5 DNS TXT Record Discovery (G20)

Agents MAY discover a domain's EEP manifest by checking its DNS TXT record at `_eep.<domain>`:

```
_eep.publisher.example.  IN TXT  "v=eep1; manifest=https://publisher.example/.well-known/eep.json"
```

**Format:** `v=eep1; manifest=<https-url>` — a version token (`eep1`) and `;`-separated `key=value` pairs; the `manifest` URL MUST be HTTPS. This is the format encoded by the manifest schema's `discovery_hints.dns_txt_record` field and parsed by the reference implementation (`@eep-dev/discovery` `parseDnsTxtRecord`); the publisher's DID is resolved from the manifest it points to. Agents SHOULD treat absence of this record as a trust-signal downgrade but MUST NOT treat it as an outright rejection (DNS deployment takes time).

---

## §12.6 Registry Federation Protocol (G20)

Federated registries allow vertical-market or regional registries to integrate with eep.dev while maintaining their own trust criteria.

**Discovery:** Federation registries publish `/.well-known/eep-registry.json` (schema: `schemas/v0.1/eep-registry.json`).

**Trust model:**
1. eep.dev issues a **Federation Credential** VC to each verified federated registry
2. The registry's `federation_credential_url` points to this VC
3. Agents verify the Federation Credential before trusting registry lookups
4. Cross-registry resolution is available via `cross_registry_resolution_url`

**Example `eep-registry.json`:**

```json
{
  "did": "did:web:registry.eep.eu",
  "registry_name": "EEP European Financial Registry",
  "scope": { "geography": ["EU"], "sectors": ["financial_services"] },
  "trust_criteria": {
    "did_verification": true,
    "additional_checks": ["eidas_identity_verification", "financial_license_check"]
  },
  "conformance_tier_required": "Full",
  "federation_credential_url": "https://registry.eep.eu/.well-known/eep-federation-credential.json"
}
```

### §12.6.1 Registry operator economics (normative)

Federation registry operators incur ongoing cost (APIs, databases, verification labor). The protocol does **not** mandate a single business model, but **MUST** expose machine-readable economics metadata so agents and integrators can reason about sustainability.

**`economics` object (optional in `eep-registry.json`; SHOULD for public production registries):**

| Field | Type | Description |
|-------|------|-------------|
| `registration_fee` | `object` | One-time or recurring fee to list or verify an entity (currency, amount, `per`: `once` \| `year`). |
| `query_quota` | `object` | Free tier for discovery/capability query APIs, then paid: `free_requests_per_day`, `paid_tier_url` (URI to pricing). |
| `staking_or_challenge` | `object` | Anti-Sybil policy: `mode` (`none` \| `micro_stake` \| `proof_of_payment` \| `proof_of_work_challenge`) and optional `min_amount`, `currency`, `challenge_endpoint`. |

Registries MAY combine models (e.g. free quota + paid API + optional stake). Agents MUST NOT assume registry infrastructure is volunteer-only when `economics` is absent; absence is a trust downgrade signal, not a protocol error.

