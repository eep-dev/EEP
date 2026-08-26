// Copyright 2026 EEP Contributors — Apache-2.0
import { describe, it, expect, beforeAll } from 'vitest';
// Schemas are JSON Schema 2020-12; Ajv's default export only
// understands draft-07, so the 2020-12 build is required.
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMAS_DIR = path.resolve(import.meta.dirname, '..', 'schemas', 'v0.1');

function loadSchema(filename: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, filename), 'utf-8'));
}

describe('EEP Schema Validation Performance', () => {
    let envelopeValidate: ValidateFunction;
    let subscriptionValidate: ValidateFunction;
    let wsMessageValidate: ValidateFunction;
    let pulseValidate: ValidateFunction;

    beforeAll(() => {
        const ajv = new Ajv2020({ allErrors: true, strict: false });
        addFormats(ajv);

        envelopeValidate = ajv.compile(loadSchema('event.envelope.json'));
        subscriptionValidate = ajv.compile(loadSchema('subscription.request.json'));
        wsMessageValidate = ajv.compile(loadSchema('ws-message.json'));
        pulseValidate = ajv.compile(loadSchema('eep-pulse-message-schema.json'));
    });

    const ITERATIONS = 10_000;
    const MAX_MS_PER_OP = 1;

    it(`validates ${ITERATIONS} event envelopes within ${MAX_MS_PER_OP}ms/op`, () => {
        const payload = {
            specversion: '1.0',
            id: 'evt-perf-001',
            source: 'did:web:example.com:u:perf-test',
            type: 'com.example.entity.updated',
            time: '2026-02-22T14:30:00Z',
            datacontenttype: 'application/json',
            data: { entity_id: 'u/perf-test', changes: ['name'] },
            eep_version: '0.1',
            eep_trust_score: 75,
            eep_actor_type: 'agent',
        };

        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            envelopeValidate(payload);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / ITERATIONS;

        console.log(`  event.envelope: ${ITERATIONS} validations in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });

    it(`validates ${ITERATIONS} subscription requests within ${MAX_MS_PER_OP}ms/op`, () => {
        const payload = {
            source_did: 'did:web:example.com:u:benchmark',
            event_types: ['com.example.entity.*', 'com.example.trust.*'],
            delivery_method: 'webhook',
            delivery_url: 'https://bench.example.com/hooks/eep',
            metadata: { description: 'Benchmark subscription' },
        };

        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            subscriptionValidate(payload);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / ITERATIONS;

        console.log(`  subscription.request: ${ITERATIONS} validations in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });

    it(`validates ${ITERATIONS} WebSocket messages within ${MAX_MS_PER_OP}ms/op`, () => {
        const payload = {
            v: 1,
            type: 'entity',
            action: 'update',
            seq: 42,
            data: { source_did: 'did:web:example.com:u:bench', entity_id: 'u/bench' },
        };

        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            wsMessageValidate(payload);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / ITERATIONS;

        console.log(`  ws-message: ${ITERATIONS} validations in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });

    it(`validates ${ITERATIONS} Pulse messages within ${MAX_MS_PER_OP}ms/op`, () => {
        const payload = {
            v: 1,
            type: 'system',
            action: 'ping',
            seq: 100,
        };

        const start = performance.now();
        for (let i = 0; i < ITERATIONS; i++) {
            pulseValidate(payload);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / ITERATIONS;

        console.log(`  eep-pulse-message: ${ITERATIONS} validations in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });

    it('validates mixed payloads (realistic traffic simulation)', () => {
        const payloads = [
            {
                validate: envelopeValidate, payload: {
                    specversion: '1.0', id: 'evt-mix-001', source: 'did:web:example.com:u:mix',
                    type: 'com.example.entity.updated', time: '2026-02-22T14:30:00Z',
                    datacontenttype: 'application/json',
                }
            },
            {
                validate: wsMessageValidate, payload: {
                    v: 1, type: 'system', action: 'ping',
                }
            },
            {
                validate: subscriptionValidate, payload: {
                    source_did: 'did:web:example.com:u:mix', event_types: ['com.example.entity.*'],
                    delivery_method: 'sse',
                }
            },
            {
                validate: wsMessageValidate, payload: {
                    v: 1, type: 'entity', action: 'update', seq: 1,
                    data: { source_did: 'did:web:example.com:u:mix' },
                }
            },
        ];

        const iterations = ITERATIONS;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            const entry = payloads[i % payloads.length];
            entry.validate(entry.payload);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / iterations;

        console.log(`  mixed traffic: ${iterations} validations in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });

    it('rejects invalid payloads efficiently', () => {
        const invalidPayloads = [
            { specversion: '0.3', id: 123 },
            { v: 99, type: 'bad' },
            { source_did: '' },
            {},
        ];

        const iterations = ITERATIONS;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
            envelopeValidate(invalidPayloads[i % invalidPayloads.length]);
        }
        const elapsed = performance.now() - start;
        const perOp = elapsed / iterations;

        console.log(`  invalid payloads: ${iterations} rejections in ${elapsed.toFixed(2)}ms (${perOp.toFixed(4)}ms/op)`);
        expect(perOp).toBeLessThan(MAX_MS_PER_OP);
    });
});
