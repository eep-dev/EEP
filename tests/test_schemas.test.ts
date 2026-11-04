// Copyright 2026 EEP Contributors — Apache-2.0
import { describe, it, expect, beforeAll } from 'vitest';
// Schemas are JSON Schema 2020-12; Ajv's default export only
// understands draft-07, so the 2020-12 build is required.
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '..', 'schemas', 'v0.1');

function loadSchema(filename: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), 'utf-8'));
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeValidEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        specversion: '1.0',
        id: 'evt-test-001',
        source: 'did:web:example.com:u:acme-corp',
        type: 'com.example.entity.updated',
        time: '2026-02-22T14:30:00Z',
        datacontenttype: 'application/json',
        ...overrides,
    };
}

function makeValidSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        source_did: 'did:web:example.com:u:acme-corp',
        event_types: ['com.example.entity.updated'],
        delivery_method: 'webhook',
        delivery_url: 'https://agent.example.com/hooks/eep',
        ...overrides,
    };
}

function makeValidWsMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        v: 1,
        type: 'entity',
        action: 'update',
        ...overrides,
    };
}

function makeValidPulseMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        v: 1,
        type: 'system',
        action: 'connected',
        ...overrides,
    };
}

// ── Test Suite ──────────────────────────────────────────────────────

describe('EEP JSON Schema Validation', () => {
    let ajv: Ajv;

    beforeAll(() => {
        ajv = new Ajv2020({ allErrors: true, strict: false });
        addFormats(ajv);
    });

    // ── event.envelope.json ─────────────────────────────────────────

    describe('Schema: event.envelope.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('event.envelope.json');
            validate = ajv.compile(schema);
        });

        it('is a valid JSON Schema (compiles without errors)', () => {
            expect(validate).toBeDefined();
            expect(typeof validate).toBe('function');
        });

        it('validates a minimal correct event envelope', () => {
            const valid = validate(makeValidEnvelope());
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates an envelope with all EEP extension fields', () => {
            const valid = validate(makeValidEnvelope({
                data: { entity_id: 'u/acme-corp' },
                eep_version: '0.1',
                eep_subscription_id: 'sub_01HN3QK7GX',
                eep_delivery_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                eep_delivery_timestamp: '2026-03-05T10:00:00Z',
                eep_trust_score: 85,
                eep_actor_type: 'human',
            }));
            expect(valid).toBe(true);
        });

        it('rejects missing specversion', () => {
            const { specversion, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
            expect(validate.errors?.some(e => e.message?.includes('specversion') || e.params?.missingProperty === 'specversion')).toBe(true);
        });

        it('rejects missing id', () => {
            const { id, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing source', () => {
            const { source, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing type', () => {
            const { type, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing time', () => {
            const { time, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing datacontenttype', () => {
            const { datacontenttype, ...rest } = makeValidEnvelope();
            expect(validate(rest)).toBe(false);
        });

        it('rejects wrong specversion value', () => {
            expect(validate(makeValidEnvelope({ specversion: '0.3' }))).toBe(false);
        });

        it('rejects wrong datacontenttype value', () => {
            expect(validate(makeValidEnvelope({ datacontenttype: 'text/plain' }))).toBe(false);
        });

        it('rejects non-string id', () => {
            expect(validate(makeValidEnvelope({ id: 12345 }))).toBe(false);
        });

        it('rejects empty id', () => {
            expect(validate(makeValidEnvelope({ id: '' }))).toBe(false);
        });

        it('rejects id exceeding maxLength (128)', () => {
            expect(validate(makeValidEnvelope({ id: 'x'.repeat(129) }))).toBe(false);
        });

        it('rejects invalid type pattern (uppercase)', () => {
            expect(validate(makeValidEnvelope({ type: 'MD.More.Entity' }))).toBe(false);
        });

        it('rejects type shorter than minLength (5)', () => {
            expect(validate(makeValidEnvelope({ type: 'a.b' }))).toBe(false);
        });

        it('accepts catalog event types with underscores in suffix segments (§8/§9)', () => {
            expect(validate(makeValidEnvelope({ type: 'com.acme.product.price_changed' }))).toBe(true);
            expect(validate(makeValidEnvelope({ type: 'gate.access_granted' }))).toBe(true);
        });

        it('still rejects an underscore in the root segment', () => {
            expect(validate(makeValidEnvelope({ type: 'com_root.entity.updated' }))).toBe(false);
        });

        it('rejects non-ISO8601 time', () => {
            expect(validate(makeValidEnvelope({ time: 'not-a-date' }))).toBe(false);
        });

        it('rejects eep_trust_score below 0', () => {
            expect(validate(makeValidEnvelope({ eep_trust_score: -1 }))).toBe(false);
        });

        it('rejects eep_trust_score above 100', () => {
            expect(validate(makeValidEnvelope({ eep_trust_score: 101 }))).toBe(false);
        });

        it('rejects invalid eep_actor_type enum value', () => {
            expect(validate(makeValidEnvelope({ eep_actor_type: 'robot' }))).toBe(false);
        });

        it('accepts all valid eep_actor_type values', () => {
            for (const actorType of ['human', 'agent', 'system', 'cron']) {
                expect(validate(makeValidEnvelope({ eep_actor_type: actorType }))).toBe(true);
            }
        });

        it('allows additionalProperties (CloudEvents extension)', () => {
            expect(validate(makeValidEnvelope({ customext: 'allowed' }))).toBe(true);
        });
    });

    // ── subscription.request.json ───────────────────────────────────

    describe('Schema: subscription.request.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('subscription.request.json');
            validate = ajv.compile(schema);
        });

        it('is a valid JSON Schema (compiles without errors)', () => {
            expect(validate).toBeDefined();
        });

        it('validates a correct webhook subscription', () => {
            const valid = validate(makeValidSubscription());
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates an SSE subscription without delivery_url', () => {
            const valid = validate(makeValidSubscription({
                delivery_method: 'sse',
                delivery_url: undefined,
            }));
            expect(valid).toBe(true);
        });

        it('validates subscription with metadata', () => {
            const valid = validate(makeValidSubscription({
                metadata: { description: 'Monitor trust', agent_id: 'agent-42' },
            }));
            expect(valid).toBe(true);
        });

        it('rejects missing source_did', () => {
            const { source_did, ...rest } = makeValidSubscription();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing event_types', () => {
            const { event_types, ...rest } = makeValidSubscription();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing delivery_method', () => {
            const { delivery_method, ...rest } = makeValidSubscription();
            expect(validate(rest)).toBe(false);
        });

        it('rejects empty event_types array', () => {
            expect(validate(makeValidSubscription({ event_types: [] }))).toBe(false);
        });

        it('rejects invalid delivery_method', () => {
            expect(validate(makeValidSubscription({ delivery_method: 'email' }))).toBe(false);
        });

        it('rejects webhook subscription without delivery_url', () => {
            const sub = makeValidSubscription();
            delete (sub as Record<string, unknown>).delivery_url;
            expect(validate(sub)).toBe(false);
        });

        it('rejects http:// delivery_url (must be https)', () => {
            expect(validate(makeValidSubscription({
                delivery_url: 'http://insecure.example.com/hook',
            }))).toBe(false);
        });

        it('rejects additionalProperties', () => {
            expect(validate(makeValidSubscription({
                unknown_field: 'should fail',
            }))).toBe(false);
        });

        it('rejects event_types exceeding maxItems (50)', () => {
            const types = Array.from({ length: 51 }, (_, i) => `com.example.type${i}.event`);
            expect(validate(makeValidSubscription({ event_types: types }))).toBe(false);
        });

        it('validates wildcard event type patterns', () => {
            expect(validate(makeValidSubscription({
                event_types: ['com.example.entity.*', 'com.example.trust.*'],
            }))).toBe(true);
        });

        it('rejects invalid source_did format', () => {
            expect(validate(makeValidSubscription({ source_did: 'not-a-did' }))).toBe(false);
        });

        it('accepts https:// source_did', () => {
            expect(validate(makeValidSubscription({
                source_did: 'https://api.example.com/entities/acme-corp',
            }))).toBe(true);
        });
    });

    // ── ws-message.json ─────────────────────────────────────────────

    describe('Schema: ws-message.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('ws-message.json');
            validate = ajv.compile(schema);
        });

        it('is a valid JSON Schema (compiles without errors)', () => {
            expect(validate).toBeDefined();
        });

        it('validates a minimal entity update message', () => {
            const valid = validate(makeValidWsMessage());
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates a system.auth_expiring message with data.expires_in', () => {
            expect(validate({
                v: 1,
                type: 'system',
                action: 'auth_expiring',
                data: { expires_in: 60 },
            })).toBe(true);
        });

        it('validates a system.auth_refresh message with data.token', () => {
            expect(validate({
                v: 1,
                type: 'system',
                action: 'auth_refresh',
                data: { token: 'eyJhbGciOiJIUzI1NiJ9.test.sig' },
            })).toBe(true);
        });

        it('validates a system.replay message with data.from_seq', () => {
            expect(validate({
                v: 1,
                type: 'system',
                action: 'replay',
                data: { from_seq: 42 },
            })).toBe(true);
        });

        it('validates a message with seq field', () => {
            expect(validate(makeValidWsMessage({ seq: 100 }))).toBe(true);
        });

        it('validates an a2a message', () => {
            expect(validate({
                v: 1,
                type: 'a2a',
                action: 'task_request',
            })).toBe(true);
        });

        it('validates an error message', () => {
            expect(validate({
                v: 1,
                type: 'system',
                action: 'error',
                error: { code: 'rate_limited', message: 'Too many requests' },
            })).toBe(true);
        });

        it('rejects missing v', () => {
            const { v, ...rest } = makeValidWsMessage();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing type', () => {
            const { type, ...rest } = makeValidWsMessage();
            expect(validate(rest)).toBe(false);
        });

        it('rejects missing action', () => {
            const { action, ...rest } = makeValidWsMessage();
            expect(validate(rest)).toBe(false);
        });

        it('rejects wrong protocol version', () => {
            expect(validate(makeValidWsMessage({ v: 2 }))).toBe(false);
        });

        it('rejects invalid type value', () => {
            expect(validate(makeValidWsMessage({ type: 'invalid' }))).toBe(false);
        });

        it('rejects empty action', () => {
            expect(validate(makeValidWsMessage({ action: '' }))).toBe(false);
        });

        it('rejects action exceeding maxLength (64)', () => {
            expect(validate(makeValidWsMessage({ action: 'x'.repeat(65) }))).toBe(false);
        });

        it('rejects negative seq', () => {
            expect(validate(makeValidWsMessage({ seq: -1 }))).toBe(false);
        });
    });

    // ── eep-pulse-message-schema.json ───────────────────────────────

    describe('Schema: eep-pulse-message-schema.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('eep-pulse-message-schema.json');
            validate = ajv.compile(schema);
        });

        it('is a valid JSON Schema (compiles without errors)', () => {
            expect(validate).toBeDefined();
        });

        it('validates a system.connected message', () => {
            expect(validate(makeValidPulseMessage())).toBe(true);
        });

        it('validates a system.ping message', () => {
            expect(validate({ v: 1, type: 'system', action: 'ping' })).toBe(true);
        });

        it('validates an entity.update message', () => {
            expect(validate({
                v: 1,
                type: 'entity',
                action: 'update',
                data: { source_did: 'did:web:example.com:u:test' },
            })).toBe(true);
        });

        it('validates an entity.publish message', () => {
            expect(validate({
                v: 1,
                type: 'entity',
                action: 'publish',
                data: { source_did: 'did:web:example.com:u:pub' },
            })).toBe(true);
        });

        it('validates an entity.delete message', () => {
            expect(validate({
                v: 1,
                type: 'entity',
                action: 'delete',
                data: { source_did: 'did:web:example.com:u:del' },
            })).toBe(true);
        });

        it('validates an a2a.task_request message', () => {
            expect(validate({
                v: 1,
                type: 'a2a',
                action: 'task_request',
            })).toBe(true);
        });

        it('validates a chat.send message', () => {
            expect(validate({
                v: 1,
                type: 'chat',
                action: 'send',
            })).toBe(true);
        });

        it('validates a commerce.offer message', () => {
            expect(validate({
                v: 1,
                type: 'commerce',
                action: 'offer',
                data: { negotiation_id: 'neg_01abc2def3' },
            })).toBe(true);
        });

        it('validates all system action values', () => {
            const actions = [
                'connected', 'ping', 'pong', 'subscribe', 'subscribed',
                'unsubscribe', 'unsubscribed', 'replay', 'replay_complete',
                'gap_detected', 'auth_expiring', 'auth_refresh', 'auth_refreshed',
                'auth_expired', 'error',
            ];
            for (const action of actions) {
                const valid = validate({ v: 1, type: 'system', action });
                if (!valid) console.error(`system.${action} failed:`, validate.errors);
                expect(valid).toBe(true);
            }
        });

        it('validates all a2a action values', () => {
            const actions = [
                'task_request', 'task_accepted', 'task_received', 'task_progress',
                'task_progress_ack', 'task_complete', 'task_complete_ack',
                'task_failed', 'task_failed_ack', 'task_cancel', 'task_cancel_ack',
                'task_cancelled',
            ];
            for (const action of actions) {
                expect(validate({ v: 1, type: 'a2a', action })).toBe(true);
            }
        });

        it('validates all chat action values', () => {
            for (const action of ['send', 'sent', 'received', 'history', 'read', 'read_ack']) {
                expect(validate({ v: 1, type: 'chat', action })).toBe(true);
            }
        });

        it('validates all commerce action values', () => {
            for (const action of ['offer', 'counter', 'accept', 'reject', 'invoice', 'receipt', 'complete', 'dispute']) {
                expect(validate({ v: 1, type: 'commerce', action })).toBe(true);
            }
        });

        it('validates all entity action values', () => {
            for (const action of ['update', 'publish', 'delete']) {
                expect(validate({
                    v: 1,
                    type: 'entity',
                    action,
                    data: { source_did: 'did:web:example.com:u:test' },
                })).toBe(true);
            }
        });

        it('rejects missing v', () => {
            expect(validate({ type: 'system', action: 'ping' })).toBe(false);
        });

        it('rejects missing type', () => {
            expect(validate({ v: 1, action: 'ping' })).toBe(false);
        });

        it('rejects missing action', () => {
            expect(validate({ v: 1, type: 'system' })).toBe(false);
        });

        it('rejects wrong protocol version', () => {
            expect(validate({ v: 99, type: 'system', action: 'ping' })).toBe(false);
        });

        it('rejects unknown type category', () => {
            expect(validate({ v: 1, type: 'unknown', action: 'test' })).toBe(false);
        });
    });

    // ── gate.config.json ────────────────────────────────────────────

    describe('Schema: gate.config.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('gate.config.json');
            validate = ajv.compile(schema);
        });

        it('compiles without errors', () => {
            expect(validate).toBeDefined();
        });

        it('validates a minimal gate config with public tier only', () => {
            const valid = validate({
                default_tier: 'public',
                tiers: {
                    public: { requirements: [], access: ['profile.summary'] },
                },
            });
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates a gate config with multiple tiers and requirement types', () => {
            expect(validate({
                default_tier: 'free',
                tiers: {
                    free: { requirements: [], access: ['profile.*'] },
                    premium: {
                        label: 'Premium',
                        requirements: [
                            { type: 'payment', amount: 10, currency: 'usd', per: 'month' },
                        ],
                        access: ['*'],
                    },
                    academic: {
                        requirements: [
                            { type: 'credential', credential_type: 'AcademicAffiliation' },
                        ],
                        access: ['content.papers.*'],
                    },
                },
            })).toBe(true);
        });

        it('rejects missing default_tier', () => {
            expect(validate({
                tiers: { public: { requirements: [], access: ['*'] } },
            })).toBe(false);
        });

        it('rejects missing tiers object', () => {
            expect(validate({ default_tier: 'public' })).toBe(false);
        });

        it('rejects tier with empty access array', () => {
            expect(validate({
                default_tier: 'public',
                tiers: {
                    public: { requirements: [], access: [] },
                },
            })).toBe(false);
        });
    });

    // ── gate.proof.json ─────────────────────────────────────────────

    describe('Schema: gate.proof.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('gate.proof.json');
            validate = ajv.compile(schema);
        });

        it('compiles without errors', () => {
            expect(validate).toBeDefined();
        });

        it('validates a payment proof', () => {
            const valid = validate({
                gate_proofs: [{
                    type: 'payment',
                    token: 'tok_stripe_xxx',
                    issued_at: '2026-03-01T00:00:00Z',
                    expires_at: '2026-04-01T00:00:00Z',
                }],
            });
            if (!valid) console.error('payment proof errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates a trust proof', () => {
            const valid = validate({
                gate_proofs: [{
                    type: 'trust',
                    self_attested: true,
                    issued_at: '2026-03-01T00:00:00Z',
                }],
            });
            if (!valid) console.error('trust proof errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates a credential proof', () => {
            const valid = validate({
                gate_proofs: [{
                    type: 'credential',
                    credential: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.test_vc_payload.signature',
                    format: 'jwt_vc',
                    issued_at: '2026-03-01T00:00:00Z',
                }],
            });
            if (!valid) console.error('credential proof errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('rejects missing gate_proofs', () => {
            expect(validate({
                type: 'payment',
                token: 'tok_xxx',
            })).toBe(false);
        });
    });

    // ── gate.402-response.json ──────────────────────────────────────

    describe('Schema: gate.402-response.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('gate.402-response.json');
            validate = ajv.compile(schema);
        });

        it('compiles without errors', () => {
            expect(validate).toBeDefined();
        });

        it('validates a correct 402 response', () => {
            const valid = validate({
                error: 'access_restricted',
                resource: 'content.papers.full_text',
                current_tier: 'public',
                required_tier: 'academic',
                unmet_requirements: [
                    { type: 'credential', resolution_hint: 'AcademicAffiliation VC required' },
                ],
            });
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('rejects missing error field', () => {
            expect(validate({
                resource: 'content.papers.full_text',
                unmet_requirements: [],
            })).toBe(false);
        });

        it('rejects missing resource field', () => {
            expect(validate({
                error: 'access_restricted',
                unmet_requirements: [],
            })).toBe(false);
        });
    });

    // ── commerce.negotiation.json ───────────────────────────────────

    describe('Schema: commerce.negotiation.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('commerce.negotiation.json');
            validate = ajv.compile(schema);
        });

        it('compiles without errors', () => {
            expect(validate).toBeDefined();
        });

        it('validates a fixed pricing model', () => {
            expect(validate({
                negotiation_id: 'neg_01abc2def3',
                service: 'consulting',
                pricing: { model: 'fixed', amount: 100, currency: 'usd' },
            })).toBe(true);
        });

        it('validates a subscription pricing model', () => {
            expect(validate({
                negotiation_id: 'neg_02xyz3abc4',
                service: 'data_feed',
                pricing: { model: 'subscription', amount: 29, currency: 'usd', period: 'month' },
            })).toBe(true);
        });

        it('rejects missing negotiation_id', () => {
            expect(validate({
                service: 'consulting',
                pricing: { model: 'fixed', amount: 100, currency: 'usd' },
            })).toBe(false);
        });
    });

    // ── service.listing.json ────────────────────────────────────────

    describe('Schema: service.listing.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const schema = loadSchema('service.listing.json');
            validate = ajv.compile(schema);
        });

        it('compiles without errors', () => {
            expect(validate).toBeDefined();
        });

        it('validates a complete service listing', () => {
            const valid = validate({
                entity_did: 'did:web:example.com:u:alice',
                services: [{
                    id: 'svc_001',
                    name: 'Strategy Consultation',
                    category: 'consulting',
                    pricing: { model: 'fixed', amount: 75, currency: 'usd' },
                    delivery: 'realtime',
                    availability: { type: 'on_demand' },
                    negotiable: true,
                    status: 'active',
                }],
            });
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates a listing with tags and reviews', () => {
            expect(validate({
                entity_did: 'did:web:example.com:u:bob',
                services: [{
                    id: 'svc_002',
                    name: 'Data Feed',
                    category: 'data',
                    tags: ['realtime', 'api'],
                    pricing: { model: 'subscription', amount: 29, currency: 'usd', period: 'month' },
                    delivery: 'sse',
                    availability: { type: 'always' },
                    negotiable: false,
                    status: 'active',
                }],
            })).toBe(true);
        });

        it('rejects missing entity_did', () => {
            expect(validate({
                services: [],
            })).toBe(false);
        });
    });

    // ── delivery.payload.json ───────────────────────────────────────

    describe('Schema: delivery.payload.json', () => {
        let validate: ValidateFunction;

        beforeAll(() => {
            const envelopeSchema = loadSchema('event.envelope.json');
            const deliverySchema = loadSchema('delivery.payload.json');
            const localAjv = new Ajv2020({ allErrors: true, strict: false });
            addFormats(localAjv);
            localAjv.addSchema(envelopeSchema, './event.envelope.json');
            validate = localAjv.compile(deliverySchema);
        });

        it('is a valid JSON Schema (compiles with $ref resolved)', () => {
            expect(validate).toBeDefined();
        });

        it('validates a correct delivery payload', () => {
            const valid = validate(makeValidEnvelope({
                eep_subscription_id: 'sub_01HN3QK7GX',
                eep_delivery_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                eep_delivery_timestamp: '2026-03-05T10:00:00Z',
                eep_delivery_attempt: 1,
            }));
            if (!valid) console.error('Errors:', validate.errors);
            expect(valid).toBe(true);
        });

        it('validates delivery with minimal required fields', () => {
            const valid = validate(makeValidEnvelope({
                eep_subscription_id: 'sub_test',
                eep_delivery_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                eep_delivery_timestamp: '2026-03-05T10:00:00Z',
            }));
            expect(valid).toBe(true);
        });

        it('rejects missing eep_subscription_id', () => {
            expect(validate(makeValidEnvelope())).toBe(false);
        });

        it('rejects empty eep_subscription_id', () => {
            expect(validate(makeValidEnvelope({ eep_subscription_id: '' }))).toBe(false);
        });

        it('rejects eep_delivery_attempt below 1', () => {
            expect(validate(makeValidEnvelope({
                eep_subscription_id: 'sub_test',
                eep_delivery_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                eep_delivery_timestamp: '2026-03-05T10:00:00Z',
                eep_delivery_attempt: 0,
            }))).toBe(false);
        });

        it('validates high delivery attempt numbers', () => {
            expect(validate(makeValidEnvelope({
                eep_subscription_id: 'sub_test',
                eep_delivery_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
                eep_delivery_timestamp: '2026-03-05T10:00:00Z',
                eep_delivery_attempt: 5,
            }))).toBe(true);
        });
    });

    // ── Cross-schema consistency ────────────────────────────────────

    describe('Cross-schema consistency', () => {
        it('all schema files are valid JSON', () => {
            const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
            expect(schemaFiles.length).toBe(24);
            for (const file of schemaFiles) {
                expect(() => loadSchema(file)).not.toThrow();
            }
        });

        it('all schema files have $schema, $id, and title properties', () => {
            const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
            for (const file of schemaFiles) {
                const schema = loadSchema(file);
                expect(schema).toHaveProperty('$schema');
                expect(schema).toHaveProperty('$id');
                expect(schema).toHaveProperty('title');
            }
        });

        // OpenAPI 3.1's schema dialect IS JSON Schema 2020-12, and setup-cli
        // emits `openapi: "3.1.0"` documents that $ref these files. While the
        // schemas declared draft-07, those generated documents referenced
        // draft-07 schemas from a 2020-12 context — a dialect mismatch that
        // strict OpenAPI 3.1 tooling trips on.
        it('all schemas use JSON Schema 2020-12', () => {
            const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
            for (const file of schemaFiles) {
                const schema = loadSchema(file) as Record<string, any>;
                expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
            }
        });

        // `definitions` was renamed to `$defs` in 2019-09. A file still using
        // the old keyword would validate as an unknown annotation rather than
        // failing loudly, so subschemas would silently stop being reachable.
        it('uses $defs rather than the draft-07 definitions keyword', () => {
            const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
            for (const file of schemaFiles) {
                const raw = fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf-8');
                expect(raw).not.toContain('"definitions"');
                expect(raw).not.toContain('#/definitions/');
            }
        });

        it('all schemas have consistent $id URL format', () => {
            const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter((f: string) => f.endsWith('.json'));
            for (const file of schemaFiles) {
                const schema = loadSchema(file) as Record<string, any>;
                expect(schema.$id).toBe(`https://eep.dev/schemas/v0.1/${file}`);
            }
        });

        it('event.envelope and ws-message schemas agree on specversion=1.0 and v=1', () => {
            const envelope = loadSchema('event.envelope.json') as Record<string, any>;
            const wsMessage = loadSchema('ws-message.json') as Record<string, any>;
            expect(envelope.properties.specversion.const).toBe('1.0');
            expect(wsMessage.properties.v.const).toBe(1);
        });
    });
});

