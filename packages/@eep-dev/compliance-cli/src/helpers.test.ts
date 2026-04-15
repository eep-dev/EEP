import { describe, it, expect } from 'vitest';
import {
    createTestRunner,
    validateArgs,
    normalizeTarget,
    validateCloudEventsEnvelope,
    validateEEPExtensions,
    checkWebhookHeaders,
} from './helpers';

describe('@eep-dev/compliance-cli helpers', () => {

    // ── createTestRunner ────────────────────────────────────────────

    describe('createTestRunner', () => {
        it('should create an empty test runner', () => {
            const runner = createTestRunner();
            expect(runner.results).toHaveLength(0);
            expect(runner.summary()).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
        });

        it('should track pass results', () => {
            const runner = createTestRunner();
            runner.pass('test-1', 'detail');
            expect(runner.results).toHaveLength(1);
            expect(runner.results[0]).toEqual({ name: 'test-1', status: 'pass', detail: 'detail' });
        });

        it('should track fail results', () => {
            const runner = createTestRunner();
            runner.fail('test-2', 'something broke');
            expect(runner.results[0]).toEqual({ name: 'test-2', status: 'fail', detail: 'something broke' });
        });

        it('should track skip results', () => {
            const runner = createTestRunner();
            runner.skip('test-3', 'not applicable');
            expect(runner.results[0]).toEqual({ name: 'test-3', status: 'skip', detail: 'not applicable' });
        });

        it('should pass without detail', () => {
            const runner = createTestRunner();
            runner.pass('test-no-detail');
            expect(runner.results[0].detail).toBeUndefined();
        });

        it('should compute summary correctly with mixed results', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            runner.pass('t2');
            runner.fail('t3', 'err');
            runner.skip('t4', 'reason');
            const s = runner.summary();
            expect(s).toEqual({ passed: 2, failed: 1, skipped: 1, total: 4 });
        });

        it('should return Core conformance label when all pass', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            expect(runner.conformanceLabel('core')).toBe('🥉 Core EEP Compliant');
        });

        it('should return Standard conformance label when all pass', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            expect(runner.conformanceLabel('standard')).toBe('🥈 Standard EEP Compliant');
        });

        it('should return Full conformance label when all pass', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            expect(runner.conformanceLabel('full')).toBe('🏆 Full EEP Compliant');
        });

        it('should return non-compliant label with failure count', () => {
            const runner = createTestRunner();
            runner.fail('t1', 'err');
            runner.fail('t2', 'err2');
            expect(runner.conformanceLabel('core')).toBe('❌ Not EEP Compliant (2 failures)');
        });

        it('should use singular "failure" for 1 failure', () => {
            const runner = createTestRunner();
            runner.fail('t1', 'err');
            expect(runner.conformanceLabel('core')).toBe('❌ Not EEP Compliant (1 failure)');
        });
    });

    // ── validateArgs ────────────────────────────────────────────────

    describe('validateArgs', () => {
        it('should return null for valid args', () => {
            expect(validateArgs({ target: 'https://api.example.com', level: 'core', port: '9876' })).toBeNull();
        });

        it('should reject missing target', () => {
            expect(validateArgs({})).toBe('Missing required argument: --target');
        });

        it('should reject invalid level', () => {
            expect(validateArgs({ target: 'https://x', level: 'invalid' })).toContain('Invalid conformance level');
        });

        it('should accept all valid levels', () => {
            for (const level of ['core', 'standard', 'full']) {
                expect(validateArgs({ target: 'https://x', level })).toBeNull();
            }
        });

        it('should reject invalid port', () => {
            expect(validateArgs({ target: 'https://x', port: 'abc' })).toContain('Invalid port');
        });

        it('should reject port out of range', () => {
            expect(validateArgs({ target: 'https://x', port: '99999' })).toContain('Invalid port');
        });

        it('should accept valid port', () => {
            expect(validateArgs({ target: 'https://x', port: '3000' })).toBeNull();
        });
    });

    // ── normalizeTarget ─────────────────────────────────────────────

    describe('normalizeTarget', () => {
        it('should strip trailing slash', () => {
            expect(normalizeTarget('https://api.example.com/')).toBe('https://api.example.com');
        });

        it('should strip multiple trailing slashes', () => {
            expect(normalizeTarget('https://api.example.com///')).toBe('https://api.example.com');
        });

        it('should keep URLs without trailing slashes unchanged', () => {
            expect(normalizeTarget('https://api.example.com')).toBe('https://api.example.com');
        });

        it('should handle URL with path', () => {
            expect(normalizeTarget('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
        });
    });

    // ── validateCloudEventsEnvelope ──────────────────────────────────

    describe('validateCloudEventsEnvelope', () => {
        const validEvent = {
            specversion: '1.0',
            id: 'evt-123',
            source: 'did:web:example.com:u:test',
            type: 'com.example.entity.updated',
            time: '2026-02-26T12:00:00Z',
        };

        it('should return empty array for valid event', () => {
            expect(validateCloudEventsEnvelope(validEvent)).toEqual([]);
        });

        it('should detect missing id', () => {
            const { id, ...rest } = validEvent;
            expect(validateCloudEventsEnvelope(rest)).toContain('id');
        });

        it('should detect missing source', () => {
            const { source, ...rest } = validEvent;
            expect(validateCloudEventsEnvelope(rest)).toContain('source');
        });

        it('should detect wrong specversion', () => {
            const event = { ...validEvent, specversion: '0.3' };
            const missing = validateCloudEventsEnvelope(event);
            expect(missing.some(m => m.includes('specversion'))).toBe(true);
        });

        it('should detect multiple missing fields', () => {
            expect(validateCloudEventsEnvelope({})).toHaveLength(6); // 5 missing + specversion wrong
        });
    });

    // ── validateEEPExtensions ───────────────────────────────────────

    describe('validateEEPExtensions', () => {
        it('should return empty for event with eep_version', () => {
            expect(validateEEPExtensions({ eep_version: '0.1' })).toEqual([]);
        });

        it('should detect missing eep_version', () => {
            expect(validateEEPExtensions({})).toContain('eep_version');
        });
    });

    // ── checkWebhookHeaders ─────────────────────────────────────────

    describe('checkWebhookHeaders', () => {
        it('should detect all headers present', () => {
            const result = checkWebhookHeaders({
                'webhook-id': 'msg_123',
                'webhook-timestamp': '1700000000',
                'webhook-signature': 'v1,abc',
            });
            expect(result.hasId).toBe(true);
            expect(result.hasTimestamp).toBe(true);
            expect(result.hasSignature).toBe(true);
            expect(result.missing).toHaveLength(0);
        });

        it('should detect missing webhook-id', () => {
            const result = checkWebhookHeaders({
                'webhook-timestamp': '1700000000',
                'webhook-signature': 'v1,abc',
            });
            expect(result.hasId).toBe(false);
            expect(result.missing).toContain('webhook-id');
        });

        it('should detect all missing headers', () => {
            const result = checkWebhookHeaders({});
            expect(result.missing).toHaveLength(3);
        });

        it('should handle undefined values', () => {
            const result = checkWebhookHeaders({
                'webhook-id': undefined,
                'webhook-timestamp': undefined,
                'webhook-signature': undefined,
            });
            expect(result.hasId).toBe(false);
            expect(result.hasTimestamp).toBe(false);
            expect(result.hasSignature).toBe(false);
            expect(result.missing).toHaveLength(3);
        });
    });
});
