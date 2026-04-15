# How to dispatch EEP events (platform guide)

> **Audience:** Platform engineers building systems where entities live and emit events.

---

## Overview

As an EEP-compliant publisher, your platform handles:
1. Emitting events to an internal event bus when entity state changes.
2. Routing those events to active subscribers (via Webhooks or SSE).
3. Signing payloads with HMAC-SHA256.
4. Protecting against SSRF and managing delivery retries.

## Machine-actionable operator profile

This profile is optimized for agentic operations and automation runners.

### Environment contract

```bash
export EEP_BASE_URL="https://api.yourplatform.com"
export EEP_SIGNING_SECRET="whsec_..."
export EEP_API_KEY="..."
```

### Pre-deploy invariant checks

```bash
curl -fsS "$EEP_BASE_URL/.well-known/eep.json" | jq '.did,.eep_version'
curl -fsS "$EEP_BASE_URL/eep/services/did:web:yourplatform.com:u:test-entity" | jq '.services | length'
```

### Post-deploy smoke checks

```bash
# Gate endpoint shape
curl -fsS "$EEP_BASE_URL/eep/gates/did:web:yourplatform.com:u:test-entity" | jq '.default_tier,.tiers'

# Gated resource should deterministically return 200 or 402
curl -s -o /dev/null -w "%{http_code}\n" "$EEP_BASE_URL/eep/content/did:web:yourplatform.com:u:test-entity/content.papers.full_text"
```

This guide walks through implementing an EEP dispatcher.

---

## Architecture

```
Entity State Change
        │
        ▼
Internal Event Publisher
(emit to Redis Streams or RabbitMQ)
        │
        ▼
EEP Dispatcher Worker
        ├──► SSE fan-out (Redis pub/sub → open connections)
        └──► Webhook delivery (SSRF check → sign → POST → retry)
```

---

## Step 1: Define your event bus

EEP doesn't care which message bus you use. It works with Redis Streams, RabbitMQ, Kafka, or any pub/sub system. Use what you already have in your stack.

**Example with Redis Streams:**
```typescript
// Publish an event when a profile is updated
async function publishEntityUpdate(entityId: string, changes: object) {
  const event = {
    specversion: '1.0',
    id: `${entityId}-${Date.now()}`,
    source: `did:web:yourplatform.com:entity:${entityId}`,
    type: 'platform.entity.updated',
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    eep_version: '0.1',
    eep_actor_type: 'human',
    data: changes
  };

  await redis.xadd(
    `eep:events:${entityId}`,
    '*',  // Auto-generate Redis stream ID
    'event', JSON.stringify(event)
  );
}
```

---

## Step 2: Install the EEP dispatcher packages

```bash
npm install @eep-dev/signer @eep-dev/validator
```

---

## Step 3: Build the webhook dispatcher

```typescript
import { EEPSigner } from '@eep-dev/signer';
import { validateSSRF } from '@eep-dev/validator';

async function dispatchWebhook(
  subscription: WebhookSubscription,
  event: EEPEvent
): Promise<DeliveryResult> {
  const { delivery_url, delivery_secret, id: subscriptionId } = subscription;

  // 1. SSRF Protection
  await validateSSRF(delivery_url);  // Throws if URL is an internal address

  const webhookId = `msg_${generateId()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ ...event, eep_subscription_id: subscriptionId });

  // 2. Sign the payload
  const signer = new EEPSigner(delivery_secret);
  const signature = signer.sign(webhookId, timestamp, body);

  // 3. Dispatch
  const response = await fetch(delivery_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': webhookId,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
      'EEP-Version': '0.1',
    },
    body,
    signal: AbortSignal.timeout(10_000),  // 10 second timeout
    redirect: 'manual',  // Never follow redirects (SSRF prevention)
  });

  return { success: response.ok, statusCode: response.status };
}
```

---

## Step 4: Implement exponential backoff

```typescript
const RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000, 900_000, 3_600_000, 21_600_000];

async function dispatchWithRetry(subscription: WebhookSubscription, event: EEPEvent) {
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    const result = await dispatchWebhook(subscription, event);

    if (result.success) {
      await db.resetFailureCount(subscription.id);
      return;
    }

    consecutiveFailures++;

    // Auto-pause after 5 consecutive failures
    if (consecutiveFailures >= 5) {
      await db.pauseSubscription(subscription.id);
      await notifySubscriberOfPause(subscription);
      return;
    }
  }

  await db.markEventUndeliverable(subscription.id, event.id);
}
```

---

## Step 5: Implement WebSub intent verification

Before activating any webhook subscription, send a challenge to make sure the endpoint actually requested it:

```typescript
async function verifyWebhookIntent(subscription: PendingSubscription): Promise<boolean> {
  const challenge = generateSecureRandom(32);
  const params = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.topic': subscription.source_did,
    'hub.challenge': challenge,
    'hub.lease_seconds': '2592000',
  });

  try {
    const response = await fetch(`${subscription.delivery_url}?${params}`, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',  // No redirects
    });

    if (!response.ok) return false;

    const body = await response.text();
    return body.trim() === challenge;  // Exact match required
  } catch {
    return false;
  }
}
```

---

## Step 6: Build the SSE fan-out

```typescript
// Redis pub/sub channel per entity
const CHANNEL = (entityId: string) => `eep:fanout:${entityId}`;

// Publisher side: when an event is emitted
async function fanOutToSSEClients(event: EEPEvent) {
  await redis.publish(CHANNEL(event.source), JSON.stringify(event));
}

// SSE handler (one per connected client)
app.get('/eep/stream', async (req, res) => {
  const { source, events: eventFilter, last_event_id } = req.query;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Replay missed events
  if (last_event_id) {
    const missed = await redis.xrange(`eep:events:${source}`, `(${last_event_id}`, '+');
    for (const [id, fields] of missed) {
      const event = JSON.parse(fields[1]);
      if (matchesFilter(event.type, eventFilter)) {
        res.write(`id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }
  }

  // Subscribe to live events
  const subscriber = redis.duplicate();
  await subscriber.subscribe(CHANNEL(source));
  subscriber.on('message', (_, message) => {
    const event = JSON.parse(message);
    if (matchesFilter(event.type, eventFilter)) {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${message}\n\n`);
    }
  });

  // Heartbeat every 15s
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe();
    subscriber.quit();
  });
});
```

---

## Database schema

Add this migration to your database to store subscriptions:

```sql
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscriber_id TEXT NOT NULL,        -- Who subscribed (user/agent ID)
  source_did TEXT NOT NULL,           -- Entity DID being watched
  event_types TEXT[] NOT NULL,        -- Array of event type patterns
  delivery_method TEXT NOT NULL,      -- 'webhook' | 'sse'
  delivery_url TEXT,                  -- For webhooks only
  delivery_secret TEXT,               -- HMAC signing key
  delivery_format TEXT DEFAULT 'cloudevents/v1.0',
  status TEXT DEFAULT 'pending_verification',
  failure_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN (
    'pending_verification', 'active', 'paused', 'rejected', 'deleted'
  )),
  CONSTRAINT valid_delivery CHECK (
    delivery_method != 'webhook' OR delivery_url IS NOT NULL
  )
);

CREATE INDEX idx_ws_source_status ON webhook_subscriptions(source_did, status);
CREATE INDEX idx_ws_subscriber ON webhook_subscriptions(subscriber_id);
```

---

## Step 7: Add gate configuration (optional, for standard conformance)

If your entities offer tiered access, configure gates using `@eep-dev/gates`:

```bash
npm install @eep-dev/gates
```

### Serve gate configuration

```typescript
import { parseGateConfig, resolveAccess, build402Response, ProofVerifierRegistry } from '@eep-dev/gates';

// Load gate config per entity (from database, config file, etc.)
const config = parseGateConfig(entityGateConfig);

app.get('/eep/gates/:did', (req, res) => {
  res.json(entityGateConfig);
});
```

### Return 402 for gated resources

```typescript
app.get('/eep/content/:did/:path*', async (req, res) => {
  const proofs = parseProofsFromRequest(req); // from headers or body
  const result = await resolveAccess(proofs, gateConfig, req.params.path, registry);

  if (!result.granted) {
    const body = await build402Response(gateConfig, req.params.path, proofs);
    return res.status(402).json(body);
  }

  // Serve the resource at the granted tier
  res.json({ tier: result.tier, content: getContent(req.params.path, result.tier) });
});
```

### Accept gated subscriptions

When a subscriber includes `tier` and `gate_proofs` in their subscription request, verify proofs before activating:

```typescript
if (body.tier && body.tier !== gateConfig.default_tier) {
  const result = await resolveAccess(body.gate_proofs ?? [], gateConfig, '*', registry);
  if (!result.granted || result.tier !== body.tier) {
    return res.status(402).json(await build402Response(gateConfig, '*', body.gate_proofs ?? []));
  }
}
```

### Tier-aware event delivery

When dispatching events to tier-aware subscribers, include the `eep_tier` extension attribute:

```typescript
const event = {
  ...baseEvent,
  eep_tier: subscription.tier, // e.g., "premium"
};
```

Filter event data based on tier if needed — premium subscribers might get richer payloads.

---

## Step 8: Publish a service catalog (optional, for full conformance)

```typescript
app.get('/eep/services/:did', (req, res) => {
  res.json({
    entity_did: req.params.did,
    services: [
      {
        id: 'svc_data_feed',
        name: 'Real-time Data Feed',
        category: 'data',
        pricing: { model: 'subscription', amount: 29, currency: 'usd', period: 'month' },
        delivery: 'sse',
        availability: { type: 'always' },
        negotiable: true,
        status: 'active',
      },
    ],
  });
});
```

