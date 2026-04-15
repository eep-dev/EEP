# EEP delivery guarantees

This document details the reliability and delivery semantics required by EEP-compliant publishers.

---

## 1. Delivery semantics

EEP uses at-least-once delivery for webhooks and SSE streams. This means:
- Every event is delivered at least once.
- Duplicate delivery is possible during retries.
- Subscribers MUST process events idempotently using the event's `id` field.

**Why at-least-once, not exactly-once?**

Exactly-once delivery across distributed systems requires distributed transactions, which add latency and complexity. Most EEP use cases (state synchronization, monitoring, dashboards) can discard duplicate events instead of handling exactly-once semantics. The event `id` field provides a reliable deduplication key.

**Exception:** Billing-critical events (like `commerce.transaction.completed`) within specific platforms MAY require exactly-once semantics using database transactions. This remains a platform-level concern, not an EEP-level requirement.

---

## 2. Webhook retry policy

Publishers MUST implement this exponential backoff schedule:

```
Attempt 1: Immediate
Attempt 2: +5 seconds
Attempt 3: +30 seconds
Attempt 4: +2 minutes
Attempt 5: +15 minutes
Attempt 6: +1 hour
Attempt 7: +6 hours
```

A failure is defined as:
- HTTP response code outside `2xx`
- No response received within 10 seconds
- Connection refused

After 5 consecutive failures, the subscription MUST transition to a `paused` state.

After the maximum retry schedule runs its course (attempt 7), the event is marked `undeliverable` and drops into the delivery audit log.

---

## 3. SSE Last-Event-ID replay

EEP publishers MUST retain events in a replay buffer for at least 24 hours.

When a subscriber reconnects with `Last-Event-ID: {id}`, the publisher MUST:
1. Look up the event with that ID in the buffer.
2. Stream all events that occurred after that ID.
3. Seamlessly continue with live events.

**Reference implementation** using Redis Streams:
```typescript
// Read events from the stream after a given ID
const missedEvents = await redis.xrange(
  'eep:events:acme-corp',
  `(${lastEventId}`,   // exclusive start (parens prefix = exclusive in Redis)
  '+'                   // all events up to current
);
```

The `+` queries up to the latest. The `(` prefix creates an exclusive range, so the event matching `lastEventId` itself is not replayed.

### 3.1 Why replay is required

Agents monitoring thousands of entities expect network interruptions. Without replay:
- The agent misses events during the gap.
- It acts on stale state.
- It could make a mistake, like missing a price drop that occurred while it was offline.

EEP moves replay responsibility to platforms instead of individual agents.

---

## 4. Delivery audit log

Publishers MUST log every webhook delivery attempt with:
- Event ID
- Subscription ID  
- Attempt number
- Timestamp
- HTTP response code (or error class)
- Response time (ms)
- Final status (`delivered`, `failed`, `undeliverable`)

This log MUST be accessible to subscribers:
```
GET /eep/subscriptions/:id/delivery-log
```

Retention: minimum 30 days.

---

## 5. Event ordering

EEP provides best-effort ordering within a single entity's event stream.

- Events from the same entity are ordered by their `time` field and assigned monotonically increasing IDs.
- Events from different entities have no ordering guarantee relative to each other.
- Subscribers MUST NOT assume that two events received in sequence for different entities occurred in that exact order.

Within a single entity's stream, out-of-order delivery can happen due to:
- Publisher failover
- Cross-datacenter replication lag

Subscribers needing strict ordering SHOULD sort by the event `time` field, not the delivery order.

---

## 6. Idempotent processing (subscriber responsibility)

Subscribers MUST be ready to process the same event multiple times. A common approach:

```typescript
// Use a database unique constraint on event_id
const [_, created] = await Event.findOrCreate({
  where: { external_event_id: webhookPayload.id },
  defaults: { ...eventData }
});

if (!created) {
  // Duplicate — skip processing
  return res.status(200).json({ status: 'duplicate', skipped: true });
}

// Process the event
await processEvent(webhookPayload);
return res.status(200).json({ status: 'processed' });
```

Returning `200` on a duplicate is correct; it prevents unnecessary retries.
