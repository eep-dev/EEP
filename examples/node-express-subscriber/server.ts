import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * EEP Reference Implementation: Node.js Webhook Receiver
 *
 * This is a minimal Express server that demonstrates how to receive and validate
 * EEP webhook events according to the specification.
 *
 * Usage:
 *   EEP_WEBHOOK_SECRET=your_secret node server.js
 *
 * @see EEP/docs/guides/how-to-subscribe.md
 */

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const SECRET = process.env.EEP_WEBHOOK_SECRET!;

if (!SECRET) {
    console.error('ERROR: EEP_WEBHOOK_SECRET environment variable is required');
    process.exit(1);
}

// IMPORTANT: Parse body as raw Buffer BEFORE JSON.parse, so we can verify the signature
// over the exact original byte sequence (not a re-serialized version).
app.use('/hooks/eep', express.raw({ type: 'application/json' }));

// ── WebSub Intent Verification ────────────────────────────────────────────────
// The EEP platform will call this GET endpoint when you subscribe.
// You MUST respond with only the hub.challenge string.
app.get('/hooks/eep', (req, res) => {
    const mode = req.query['hub.mode'];
    const challenge = req.query['hub.challenge'] as string;
    const topic = req.query['hub.topic'];

    if (mode !== 'subscribe' || !challenge) {
        return res.status(400).send('Bad request: missing hub.mode or hub.challenge');
    }

    console.log(`📬 WebSub challenge received for topic: ${topic}`);
    console.log(`   Responding with challenge: ${challenge}`);

    // Respond with ONLY the challenge string, nothing else
    res.status(200).send(challenge);
});

// ── Webhook Event Receiver ────────────────────────────────────────────────────
app.post('/hooks/eep', (req, res) => {
    const webhookId = req.headers['webhook-id'] as string;
    const timestamp = req.headers['webhook-timestamp'] as string;
    const signature = req.headers['webhook-signature'] as string;
    const rawBody = req.body as Buffer;

    // ── 1. Check required Standard Webhooks headers ──
    if (!webhookId || !timestamp || !signature) {
        console.warn('⚠️ Missing Standard Webhooks headers');
        return res.status(401).json({ error: 'Missing webhook signature headers' });
    }

    // ── 2. Verify timestamp (replay attack prevention) ──
    const timestampNum = parseInt(timestamp, 10);
    if (Number.isNaN(timestampNum)) {
        return res.status(401).json({ error: 'Invalid webhook-timestamp header' });
    }

    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNum);

    if (ageSeconds > 60) {
        console.warn(`⚠️ Timestamp rejected: ${ageSeconds}s old (max 60s)`);
        return res.status(401).json({ error: 'Webhook timestamp outside tolerance window' });
    }

    // ── 3. Compute and verify HMAC-SHA256 signature ──
    const rawBodyString = rawBody.toString();
    const signedContent = `${webhookId}.${timestamp}.${rawBodyString}`;

    const expectedHmac = createHmac('sha256', SECRET)
        .update(signedContent, 'utf8')
        .digest('base64');

    const expectedFull = Buffer.from(`v1,${expectedHmac}`);
    const candidates = signature.split(/\s+/).filter(Boolean);

    let signatureValid = false;
    for (const candidate of candidates) {
        const incomingFull = Buffer.from(candidate);
        if (expectedFull.length === incomingFull.length && timingSafeEqual(expectedFull, incomingFull)) {
            signatureValid = true;
            break;
        }
    }

    if (!signatureValid) {
        console.warn('❌ Invalid signature — event rejected');
        return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // ── 4. Parse and process the event ──
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(rawBodyString);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    // ── 5. Idempotency check (using the event.id) ──
    const eventId = event.id as string;
    if (processedEventIds.has(eventId)) {
        console.log(`⏩ Duplicate event ignored: ${eventId}`);
        return res.status(200).json({ status: 'duplicate', skipped: true });
    }
    processedEventIds.add(eventId);

    // ── 6. Handle the event ──
    console.log(`✅ EEP event received: ${event.type}`);
    console.log(`   ID: ${event.id}`);
    console.log(`   Source: ${event.source}`);
    console.log(`   Time: ${event.time}`);
    console.log(`   Actor: ${event.eep_actor_type}`);
    console.log(`   Data:`, JSON.stringify(event.data, null, 2));

    handleEvent(event);

    // Always return 200 within 10 seconds
    res.status(200).json({ status: 'processed' });
});

// In-memory deduplication (use Redis or a DB in production)
const processedEventIds = new Set<string>();

// ── Event Handler ─────────────────────────────────────────────────────────────
function handleEvent(event: Record<string, unknown>) {
    const type = event.type as string;

    if (type.startsWith('com.example.entity.')) {
        handleEntityEvent(event);
    } else if (type.startsWith('com.example.trust.')) {
        handleTrustEvent(event);
    } else if (type.startsWith('com.example.agent.')) {
        handleAgentEvent(event);
    } else {
        console.log(`   (no specific handler for ${type})`);
    }
}

function handleEntityEvent(event: Record<string, unknown>) {
    const data = event.data as Record<string, unknown>;
    console.log(`   → Entity lifecycle event: ${event.type}`);
    // Add your business logic here
}

function handleTrustEvent(event: Record<string, unknown>) {
    const data = event.data as Record<string, unknown>;
    const prev = data.previous_score;
    const curr = data.current_score;
    console.log(`   → Trust score change: ${prev} → ${curr}`);
    // Add your business logic here (e.g., re-evaluate agent access)
}

function handleAgentEvent(event: Record<string, unknown>) {
    console.log(`   → Agent event: ${event.type}`);
    // Add your business logic here
}

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀 EEP Webhook receiver running on port ${PORT}`);
    console.log(`   Webhook URL: http://your-domain.com:${PORT}/hooks/eep`);
    console.log(`   WebSub verification: GET http://your-domain.com:${PORT}/hooks/eep`);
    console.log(`   Event reception:    POST http://your-domain.com:${PORT}/hooks/eep\n`);
});
