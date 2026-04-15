import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import {
    parseGateConfig,
    resolveAccess,
    build402Response,
    validateProofStructure,
    ProofVerifierRegistry,
    validateServiceCatalog,
    transition,
    setGlobalSecurityTelemetryRecorder,
} from '@eep-dev/gates';
import type { GateConfig, GateProof } from '@eep-dev/gates';

// ─── Load gate configuration ───────────────────────────────────
// In production, load from database or config service per entity
import gateConfigRaw from './gate-config.json';

let gateConfig: GateConfig;
try {
    gateConfig = parseGateConfig(gateConfigRaw);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Gate config invalid:', message);
    process.exit(1);
}

// ─── Proof verifiers (platform-specific) ───────────────────────
const registry = new ProofVerifierRegistry();

// Payment: verify with Stripe (placeholder)
registry.register({
    supportedTypes: ['payment'],
    verify: async (proof, requirement) => {
        // In production: stripe.paymentIntents.retrieve(proof.token)
        const token = (proof as any).token as string | undefined;
        console.log(`[verify] payment proof token=${token ?? 'missing'}`);
        return token?.startsWith('tok_') ?? false;
    },
});

// Trust: check score against platform's trust service
registry.register({
    supportedTypes: ['trust'],
    verify: async (proof, requirement) => {
        // In production: query trust service for the agent's score
        const minScore = (requirement as any).min_score ?? 0;
        return (proof as any).score >= minScore;
    },
});

// Credential: verify VC signature (placeholder)
registry.register({
    supportedTypes: ['credential'],
    verify: async (proof, requirement) => {
        // In production: verify VC signature against issuer's public key
        console.log(`[verify] credential type=${(requirement as any).credential_type}`);
        return proof.type === 'credential' && !!(proof as any).credential;
    },
});

// ─── App ────────────────────────────────────────────────────────
const app = new Hono();

setGlobalSecurityTelemetryRecorder({
    emit(metric, value, attributes) {
        console.log(
            JSON.stringify({
                level: 'info',
                event: 'eep_security_metric',
                metric,
                value,
                attributes: attributes ?? {},
                ts: new Date().toISOString(),
            })
        );
    },
});

// Gate configuration endpoint (§3.4.1)
app.get('/eep/gates/:did', (c) => {
    return c.json(gateConfigRaw);
});

// Gated resource endpoint — returns 402 if proof is insufficient
app.get('/eep/content/:did/:path{.+}', async (c) => {
    const resourcePath = c.req.param('path');

    // Extract proofs from Authorization header or request body
    // In production, parse from bearer token or request headers
    const proofsHeader = c.req.header('X-EEP-Proofs');
    let proofs: GateProof[] = [];
    if (proofsHeader) {
        try {
            proofs = JSON.parse(proofsHeader);
        } catch {
            return c.json({ error: 'invalid_proofs', message: 'X-EEP-Proofs header must be valid JSON array' }, 400);
        }
    }

    // Resolve access
    const result = await resolveAccess(proofs, gateConfig, resourcePath, registry);

    if (!result.granted) {
        const body = await build402Response(gateConfig, resourcePath, proofs);
        return c.json(body, 402);
    }

    // Access granted — serve the resource
    return c.json({
        tier: result.tier,
        resource: resourcePath,
        content: `This is the content for ${resourcePath} at tier "${result.tier}"`,
    });
});

// Gated subscription endpoint (§3.4 + subscription.request.json)
app.post('/eep/subscribe', async (c) => {
    const body = await c.req.json();
    const { source_did, event_types, delivery_method, delivery_url, tier, gate_proofs } = body;

    // If tier is specified, verify proofs
    if (tier && tier !== gateConfig.default_tier) {
        const proofs: GateProof[] = gate_proofs ?? [];
        const result = await resolveAccess(proofs, gateConfig, '*', registry);

        if (!result.granted || result.tier !== tier) {
            const body402 = await build402Response(gateConfig, '*', proofs);
            return c.json({ ...body402, subscription_error: 'insufficient_proofs' }, 402);
        }
    }

    // Create subscription (placeholder)
    const subscriptionId = `sub_${Date.now()}`;
    return c.json({
        subscription_id: subscriptionId,
        source_did,
        tier: tier ?? gateConfig.default_tier,
        status: 'active',
    }, 201);
});

// Service catalog endpoint (§15.1)
app.get('/eep/services/:did', (c) => {
    const catalog = {
        entity_did: c.req.param('did'),
        services: [
            {
                id: 'svc_data_feed',
                name: 'Real-time Data Feed',
                category: 'data',
                tags: ['realtime', 'api', 'events'],
                pricing: { model: 'subscription', amount: 29, currency: 'usd', period: 'month' },
                delivery: 'sse',
                availability: { type: 'always' },
                negotiable: true,
                status: 'active',
            },
            {
                id: 'svc_report',
                name: 'Custom Analysis Report',
                category: 'consulting',
                tags: ['analysis', 'report'],
                pricing: { model: 'fixed', amount: 150, currency: 'usd' },
                delivery: 'async',
                availability: { type: 'on_demand' },
                negotiable: true,
                status: 'active',
            },
        ],
    };

    return c.json(catalog);
});

// /.well-known/eep.json — EEP manifest (§4.1)
app.get('/.well-known/eep.json', (c) => {
    const gateTypes = Array.from(
        new Set(
            Object.values(gateConfig.tiers).flatMap((tier) =>
                tier.requirements.map((req: any) => req.type)
            )
        )
    );

    return c.json({
        did: 'did:web:example.com',
        eep_version: '0.1',
        preferred_version: '0.1',
        eep_versions: ['0.1'],
        endpoints: {
            subscribe: '/eep/subscribe',
            stream: '/eep/stream',
            gates: '/eep/gates',
            pulse: '/eep/pulse',
            services: '/eep/services',
        },
        gate_types: gateTypes,
        supported_content_types: ['application/json', 'text/event-stream'],
        pqc_ready: false,
        x402_enabled: true,
    });
});

// ─── WebSocket /eep/pulse — Layer 3 Network Pulse (§5.3) ────────
import { WebSocketServer } from 'ws';

// Commerce state machine uses @eep-dev/gates transition()
// States: offer → counter → accept → invoice → paid
interface PulseConnection {
    seq: number;
    commerceState: string;
}

const connections = new Map<any, PulseConnection>();

// ─── Start ──────────────────────────────────────────────────────
const port = 3002;
const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`EEP gate publisher running on http://localhost:${port}`);
    console.log(`  GET  /.well-known/eep.json     — EEP manifest`);
    console.log(`  GET  /eep/gates/:did          — gate config`);
    console.log(`  GET  /eep/content/:did/:path  — gated resource`);
    console.log(`  POST /eep/subscribe           — gated subscription`);
    console.log(`  GET  /eep/services/:did       — service catalog`);
    console.log(`  WS   /eep/pulse               — commerce negotiation`);
});

// Attach WebSocket server to the HTTP server
const wss = new WebSocketServer({ server: server as any, path: '/eep/pulse' });

wss.on('connection', (ws) => {
    const conn: PulseConnection = { seq: 0, commerceState: 'idle' };
    connections.set(ws, conn);

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'system',
        action: 'connected',
        seq: conn.seq++,
        data: { eep_version: '0.1', supported_actions: ['commerce.offer', 'commerce.counter', 'commerce.accept', 'commerce.invoice', 'commerce.paid'] },
    }));

    ws.on('message', (raw: Buffer) => {
        try {
            const msg = JSON.parse(raw.toString());
            const { type, action, data } = msg;

            if (type === 'commerce') {
                // Validate state transition using @eep-dev/gates commerce state machine
                const targetState = action?.replace('commerce.', '') ?? '';
                const result = transition(conn.commerceState as any, targetState as any);

                if (result.valid) {
                    conn.commerceState = result.to;
                    ws.send(JSON.stringify({
                        type: 'commerce',
                        action: `commerce.${result.to}`,
                        seq: conn.seq++,
                        data: {
                            previous_state: result.from,
                            current_state: result.to,
                            ...data,
                        },
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        action: 'commerce.invalid_transition',
                        seq: conn.seq++,
                        data: {
                            current_state: conn.commerceState,
                            attempted: targetState,
                            error: result.error ?? 'Invalid transition',
                            message: `Invalid transition from '${conn.commerceState}' to '${targetState}'`,
                        },
                    }));
                }
            } else if (type === 'subscribe') {
                // Subscription management over WebSocket
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    action: 'ack',
                    seq: conn.seq++,
                    data: { subscription_id: `ws_sub_${Date.now()}`, ...data },
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'error',
                    action: 'unknown_type',
                    seq: conn.seq++,
                    data: { message: `Unknown message type: ${type}` },
                }));
            }
        } catch (e) {
            ws.send(JSON.stringify({
                type: 'error',
                action: 'parse_error',
                seq: conn.seq++,
                data: { message: 'Invalid JSON' },
            }));
        }
    });

    ws.on('close', () => {
        connections.delete(ws);
    });
});
