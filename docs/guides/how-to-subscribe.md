# How to subscribe to EEP events (agent guide)

> **Audience:** AI agents, developer tools, and any system handling real-time updates from EEP-compliant platforms.

---

## Overview

EEP supports three subscription models:
1. **Webhooks**: The platform pushes events to a URL you control (recommended for production backends).
2. **SSE (server-sent events)**: You open a long-lived connection and receive events in real time (ideal for scripts, CLIs, and frontends).
3. **Network pulse (WebSockets)**: Bidirectional, low-latency channel for A2A task negotiation and live dashboards.

## LLM-first execution contract

Use this section when an agent needs deterministic, click-free integration steps.

### Required input bundle

```json
{
  "base_url": "https://api.example.com",
  "api_key": "Bearer ...",
  "source_did": "did:web:example.com:u:acme-corp",
  "delivery_method": "webhook|sse|ws",
  "event_types": ["com.example.entity.*"]
}
```

### Deterministic output checks

```json
{
  "webhook": ["subscription_id", "status=pending_verification|active"],
  "sse": ["content-type=text/event-stream", "event frames received"],
  "ws": ["connected ack", "monotonic seq per source"]
}
```

### Fast verification commands

```bash
# Layer 1 discovery
curl -fsS "https://api.example.com/.well-known/eep.json" | jq .

# Gate discoverability
curl -fsS "https://api.example.com/eep/gates/did:web:example.com:u:acme-corp" | jq .
```

---

## Option A: Webhook subscription

### Step 1: Set up a receiver endpoint

Your webhook receiver must:
- Accept `POST` requests at a publicly accessible URL.
- Verify the `webhook-signature` header (REQUIRED for security).
- Return HTTP `200` within 10 seconds.
- Be idempotent (ignore duplicate events that share the same `id`).

**Quick start with Express:**
```typescript
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

const app = express();
app.use(express.raw({ type: 'application/json' }));  // Parse as raw Buffer for signature verification

app.post('/hooks/eep', (req, res) => {
  const webhookId = req.headers['webhook-id'] as string;
  const timestamp = req.headers['webhook-timestamp'] as string;
  const signature = req.headers['webhook-signature'] as string;
  const rawBody = req.body.toString();
  const secret = process.env.EEP_WEBHOOK_SECRET!;

  // Verify signature
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(signedContent).digest('base64');
  const incoming = signature.replace('v1,', '');

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(incoming))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody);
  console.log(`Received EEP event: ${event.type} from ${event.source}`);
  
  // Process the event...
  
  res.status(200).json({ status: 'ok' });
});

app.listen(3000);
```

### Step 2: Register your webhook

```bash
curl -X POST https://api.example.com/eep/subscribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_did": "did:web:example.com:u:acme-corp",
    "event_types": ["com.example.entity.*", "com.example.trust.changed"],
    "delivery_method": "webhook",
    "delivery_url": "https://your-agent.example.com/hooks/eep"
  }'
```

**Response:**
```json
{
  "subscription_id": "sub_01HN3QK7GX",
  "status": "pending_verification",
  "message": "A verification challenge has been sent to your delivery_url. Your endpoint must respond within 10 seconds."
}
```

### Step 3: Pass the intent verification challenge

The platform immediately sends a `GET` request to your `delivery_url`:

```
GET https://your-agent.example.com/hooks/eep
  ?hub.mode=subscribe
  &hub.topic=did:web:example.com:u:acme-corp
  &hub.challenge=Xk9Lm3Pq...
  &hub.lease_seconds=2592000
```

Your handler must respond with HTTP `200` and the exact `hub.challenge` value as the body:

```typescript
app.get('/hooks/eep', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && challenge) {
    return res.status(200).send(challenge);  // Return ONLY the challenge string
  }
  res.status(400).send('Bad request');
});
```

After successful verification, your subscription status changes to `active`.

### Step 4: Store your webhook secret

When your subscription activates, the platform generates a `delivery_secret`. Keep it secure:

```bash
# In your environment
EEP_WEBHOOK_SECRET="whsec_ABCxyz..."
```

---

## Option B: SSE (server-sent events)

SSE is great for scripts, CLIs, and cases where you can't expose a public webhook endpoint.

### Basic SSE connection

```bash
# Using curl
curl -N "https://api.example.com/eep/stream?source=acme-corp" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Accept: text/event-stream"
```

### SSE with event type filtering

```bash
# Only receive entity and trust events
curl -N "https://api.example.com/eep/stream?source=acme-corp&events=entity.updated,trust.changed" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### SSE with missed event replay

If your connection drops, reconnect with the last ID you saved:

```bash
curl -N "https://api.example.com/eep/stream?source=acme-corp" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Last-Event-ID: 01HN3QK7GX-1708123456000"
```

The server will replay any events you missed since that ID before resuming the live stream.

### Node.js SSE client

```typescript
import { EventSource } from 'eventsource';

const sse = new EventSource(
  'https://api.example.com/eep/stream?source=acme-corp',
  { headers: { Authorization: `Bearer ${process.env.API_KEY}` } }
);

let lastEventId: string | null = null;

sse.onmessage = (event) => {
  lastEventId = event.lastEventId;
  const data = JSON.parse(event.data);
  console.log(`Event: ${data.type} | Source: ${data.source}`);
};

sse.onerror = () => {
  // EventSource auto-reconnects with Last-Event-ID
  console.log('Reconnecting...');
};
```

---

## Managing subscriptions

### List your subscriptions
```bash
curl "https://api.example.com/eep/subscriptions" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Pause a subscription
```bash
curl -X POST "https://api.example.com/eep/subscriptions/sub_01HN3QK7GX/pause" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Resume a paused subscription
```bash
curl -X POST "https://api.example.com/eep/subscriptions/sub_01HN3QK7GX/resume" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Delete a subscription
```bash
curl -X DELETE "https://api.example.com/eep/subscriptions/sub_01HN3QK7GX" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Test your webhook
```bash
# Trigger a test event delivery
curl -X POST "https://api.example.com/eep/subscriptions/sub_01HN3QK7GX/test" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Event payload reference

```json
{
  "specversion": "1.0",
  "id": "01HN3QK7GX-1708123456000",
  "source": "did:web:example.com:u:acme-corp",
  "type": "com.example.entity.updated",
  "time": "2026-02-22T14:30:00Z",
  "datacontenttype": "application/json",
  "eep_version": "0.1",
  "eep_subscription_id": "sub_01HN3QK7GX",
  "eep_trust_score": 87,
  "eep_actor_type": "human",
  "data": {
    "entity_id": "acme-corp",
    "changed_fields": ["bio"],
    "bio": "Updated company bio..."
  }
}
```

**Key fields:**
- `id`: Use this for deduplication.
- `source`: The DID of the entity that changed.
- `type`: The event type. You can use standard string matching (like `type.startsWith('com.example.trust')`) for filtering.
- `time`: An ISO 8601 timestamp. Use it to order events locally, not to assume the delivery sequence.
- `eep_actor_type`: Shows who triggered the event (`human`, `agent`, `system`, or `cron`).

---

## Option C: Network pulse (WebSockets)

Use Network pulse for bidirectional, low-latency tasks like A2A task negotiation, live dashboards, or agent-to-agent conversations.

### Connect to network pulse

```javascript
const ws = new WebSocket('wss://api.example.com/eep/pulse', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

ws.onopen = () => {
  // Subscribe to an entity's event stream
  ws.send(JSON.stringify({
    v: 1,
    type: 'system',
    action: 'subscribe',
    data: { source_did: 'did:web:example.com:u:acme-corp' }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'entity':
      console.log(`Entity event: ${msg.action} (seq: ${msg.seq})`);
      break;
    case 'system':
      if (msg.action === 'auth_expiring') {
        // Re-authenticate before connection closes
        ws.send(JSON.stringify({
          v: 1, type: 'system', action: 'auth_refresh',
          data: { token: NEW_API_KEY }
        }));
      }
      if (msg.action === 'gap_detected') {
        // Missed events detected — request replay
        console.warn(`Gap: expected seq ${msg.data.expected_seq}, got ${msg.data.received_seq}`);
        ws.send(JSON.stringify({
          v: 1, type: 'system', action: 'replay',
          data: { source_did: msg.data.source_did, from_seq: msg.data.expected_seq }
        }));
      }
      break;
  }
};
```

### Message envelope format

All messages use the same structure:
```json
{
  "v": 1,
  "type": "entity | a2a | system",
  "action": "subscribe | unsubscribe | replay | auth_refresh | ...",
  "seq": 42,
  "data": { }
}
```

### System actions

| Action | Direction | Description |
|--------|-----------|-------------|
| `subscribe` | Client → Server | Subscribe to an entity's channel |
| `unsubscribe` | Client → Server | Unsubscribe from an entity |
| `replay` | Client → Server | Request missed events from a sequence number |
| `auth_refresh` | Client → Server | Re-authenticate with a new token |
| `pong` | Client → Server | Response to server ping |
| `connected` | Server → Client | Confirmation with connection ID |
| `subscribed` | Server → Client | Subscription confirmed |
| `ping` | Server → Client | Keepalive (every 15s) |
| `auth_expiring` | Server → Client | Warning: token expires soon |
| `auth_refreshed` | Server → Client | Token refresh confirmed |
| `gap_detected` | Server → Client | Missing events detected |
| `replay_complete` | Server → Client | Replay finished |
| `error` | Server → Client | Error message |

### WebSocket close codes (EEP-defined)

EEP publishers use the following standard close codes. Agents MUST handle these appropriately:

| Code | Constant | Meaning | Agent Action |
|------|----------|---------|------|
| `4000` | `WsCloseCode.BACKPRESSURE` | **Backpressure**: subscriber is too far behind the event stream. Publisher disconnects rather than buffering indefinitely (DoS prevention). | Reconnect immediately with `Last-Event-ID` to replay missed events |
| `4001` | `WsCloseCode.SESSION_REVOKED` | Session has been revoked by the publisher | Re-authenticate from scratch; do not reconnect with same token |
| `4002` | `WsCloseCode.RATE_LIMITED` | DID-based rate limit exceeded | Wait for `Retry-After` period before reconnecting |
| `4003` | `WsCloseCode.PROOF_EXPIRED` | Gate proof or session token has expired | Re-satisfy gate requirements before reconnecting |
| `4004` | `WsCloseCode.VERSION_MISMATCH` | Incompatible EEP protocol version | Perform version negotiation; consult publisher's `eep_versions` manifest field |

---

## Gated access (gates)

Some entities restrict access to certain resources behind gates. When you try to access a gated resource without the right proofs, you get an HTTP 402 response.

### Check gate configuration

Before subscribing, check what tiers are available:

```bash
curl -s https://api.example.com/eep/gates/did:web:example.com:u:acme-corp | jq .
```

This returns the entity's gate config with tier names, requirements, and access patterns.

### Handle 402 responses

If you request a resource you don't have access to:

```json
{
  "error": "access_restricted",
  "resource": "content.papers.full_text",
  "current_tier": "public",
  "required_tier": "academic",
  "unmet_requirements": [
    { "type": "credential", "resolution_hint": "Verifiable Credential required: AcademicAffiliation" }
  ]
}
```

Your agent should parse `unmet_requirements` and decide whether to fulfill them (e.g., present a credential, make a payment) or fall back to a lower tier.

### Subscribe with a tier

```bash
curl -X POST https://api.example.com/eep/subscribe \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_did": "did:web:example.com:u:acme-corp",
    "event_types": ["com.example.entity.*"],
    "delivery_method": "sse",
    "tier": "premium",
    "gate_proofs": [
      { "type": "payment", "token": "tok_stripe_xxx", "issued_at": "2026-03-01T00:00:00Z", "expires_at": "2026-04-01T00:00:00Z" }
    ]
  }'
```

### Commerce negotiation

For negotiable services, you can trade offers over WebSocket:

```javascript
// Send an offer
ws.send(JSON.stringify({
  v: 1, type: 'commerce', action: 'offer',
  data: {
    negotiation_id: 'neg_' + Date.now(),
    service: 'consulting',
    pricing: { model: 'fixed', amount: 50, currency: 'usd' }
  }
}));

// Handle counter-offers, invoices, receipts...
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'commerce') {
    console.log(`Commerce: ${msg.action}`, msg.data);
  }
};
```

---

## Rate limits

Publishers enforce per-subscriber rate limits to prevent abuse. Each platform determines its specific limits.

When a publisher enforces rate limits, it will return the following headers in its responses:
```
X-RateLimit-Limit: {max_requests}
X-RateLimit-Remaining: {remaining}
X-RateLimit-Reset: {unix_timestamp}
```

If you exceed your limit, the publisher returns an HTTP `429` status code with a `Retry-After` header:
```json
{
  "error": "rate_limit_exceeded",
  "retry_after": 3600,
  "message": "Rate limit exceeded. See platform documentation for tier details."
}
```

---

## Publisher requirements: SSE/WS backpressure (G33)

> **This section is for publishers implementing EEP endpoints, not subscribers.**

### Why backpressure is mandatory

An SSE or WebSocket subscriber that stops reading (slow consumer, network stall, malicious actor) will cause event buffers to grow indefinitely. Without a backpressure mechanism, a single slow subscriber can exhaust the publisher's memory — a denial-of-service attack vector.

Per **Whitepaper §9.6**, EEP mandates:
> *"when a subscriber falls too far behind the event stream, the connection is gracefully terminated with a `4000` close code rather than buffering indefinitely, preventing memory exhaustion attacks from slow consumers."*

### Required implementation

Publishers MUST implement connection-level backpressure using `WsCloseCode.BACKPRESSURE` (4000):

```typescript
import { WsCloseCode, SSE_BACKPRESSURE_THRESHOLD_EVENTS } from '@eep-dev/gates';

// Example: Node.js SSE publisher backpressure check
function checkSubscriberLag(
  subscriber: SSESubscriber,
  currentEventSeq: number
): void {
  const lag = currentEventSeq - subscriber.lastAckSeq;
  if (lag > SSE_BACKPRESSURE_THRESHOLD_EVENTS) {
    // Gracefully terminate — do NOT buffer indefinitely
    subscriber.close(
      WsCloseCode.BACKPRESSURE,
      'Subscriber too far behind event stream. Reconnect with Last-Event-ID to replay.'
    );
  }
}
```

For WebSocket connections, use the standard WebSocket close frame:

```typescript
import { WsCloseCode } from '@eep-dev/gates';

// WebSocket backpressure enforcement
ws.on('drain', () => {
  const queuedBytes = ws.bufferedAmount;
  if (queuedBytes > MAX_BUFFER_BYTES) {
    ws.close(WsCloseCode.BACKPRESSURE, 'Backpressure: subscriber too slow');
  }
});
```

### Subscriber reconnection after 4000

Agents receiving a `4000` close code MUST:
1. Record the last `Last-Event-ID` before disconnecting.
2. Reconnect with `Last-Event-ID` header to replay missed events.
3. Implement exponential backoff if the publisher repeatedly closes with 4000 (indicates sustained lag).

```typescript
const sse = new EventSource(streamUrl, { headers });
let lastId = '';

sse.addEventListener('message', (e) => { lastId = e.lastEventId; });

sse.onerror = async () => {
  // Reconnect with replay — EventSource auto-includes Last-Event-ID
  console.log(`Reconnecting from event ${lastId}...`);
};
```
