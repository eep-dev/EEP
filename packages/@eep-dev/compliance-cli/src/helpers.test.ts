import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import {
    createTestRunner,
    validateArgs,
    normalizeTarget,
    validateCloudEventsEnvelope,
    validateEEPExtensions,
    checkWebhookHeaders,
    verifyWebhookSignature,
} from './helpers';

const FIXTURES_DIR = resolve(
    import.meta.dirname,
    '../../../../tests/conformance-fixtures/signature',
);

function loadFixture(name: string) {
    const dir = resolve(FIXTURES_DIR, name);
    const headers = JSON.parse(readFileSync(resolve(dir, 'headers.json'), 'utf8')) as Record<string, string>;
    const body = readFileSync(resolve(dir, 'body.txt'), 'utf8');
    const secret = readFileSync(resolve(dir, 'secret.txt'), 'utf8').trim();
    const expected = JSON.parse(readFileSync(resolve(dir, 'expected.json'), 'utf8')) as {
        valid: boolean;
        reason: string;
    };
    return { headers, body, secret, expected };
}

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

        it('should NOT award a medal when no checks ran (empty run)', () => {
            const runner = createTestRunner();
            expect(runner.conformanceLabel('full')).toBe('❌ Not EEP Compliant (no checks verified)');
        });

        it('should NOT award a medal when every check skipped', () => {
            const runner = createTestRunner();
            runner.skip('t1', 'n/a');
            runner.skip('t2', 'n/a');
            expect(runner.conformanceLabel('full')).toBe('❌ Not EEP Compliant (no checks verified)');
        });

        it('should report "incomplete" when some checks skipped (no failures)', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            runner.skip('t2', 'n/a');
            expect(runner.conformanceLabel('full')).toBe('⚠️ Full EEP: incomplete (1 skipped, 1 passed)');
        });

        it('should fall back to a generic compliant label for an unknown level', () => {
            const runner = createTestRunner();
            runner.pass('t1');
            expect(runner.conformanceLabel('enterprise')).toBe('✅ Enterprise EEP Compliant');
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

    // ── verifyWebhookSignature ──────────────────────────────────────
    //
    // These tests are the regression guard for the bug described in the
    // 2026-05 audit: the prior inline comparison built a Buffer from the
    // base64-encoded `expected` string (≈44 bytes) and `timingSafeEqual`'d
    // it against the base64-decoded incoming signature (32 bytes), which
    // throws "input buffers must have the same byte length". The throw was
    // swallowed and reported as "could not compare signatures", meaning
    // every conformance run mis-reported HMAC validity. Tests below verify
    // both shapes (single + multi-signature) against the canonical
    // fixtures under `tests/conformance-fixtures/signature/`.

    describe('verifyWebhookSignature', () => {
        const SECRET = 'whsec_test-secret-at-least-16-chars';
        const WID = 'msg_01HN3QK7GX';
        const TS = '1700000000';
        const BODY = '{"specversion":"1.0","id":"evt-1"}';

        function sign(body: string, secret: string = SECRET, wid: string = WID, ts: string = TS): string {
            const hmac = createHmac('sha256', secret).update(`${wid}.${ts}.${body}`, 'utf8').digest('base64');
            return `v1,${hmac}`;
        }

        it('accepts a freshly signed payload', () => {
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: sign(BODY),
            });
            expect(result).toEqual({ valid: true, reason: 'ok' });
        });

        it('rejects a body that was altered after signing', () => {
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: '{"specversion":"1.0","id":"evt-1","tampered":true}',
                secret: SECRET,
                signatureHeader: sign(BODY),
            });
            expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
        });

        it('rejects a signature computed with the wrong secret', () => {
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: sign(BODY, 'a-different-secret-1234567890'),
            });
            expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
        });

        it('accepts the second token in a multi-signature header (rotation)', () => {
            const fake = `v1,${'A'.repeat(44).slice(0, 43)}=`;
            const real = sign(BODY);
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: `${fake} ${real}`,
            });
            expect(result).toEqual({ valid: true, reason: 'ok_via_multi_signature' });
        });

        it('rejects a header that carries only non-v1 schemes', () => {
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: 'v2,abc v0,def',
            });
            expect(result).toEqual({ valid: false, reason: 'no_v1_token' });
        });

        it('rejects an empty header as malformed', () => {
            expect(verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: '',
            })).toEqual({ valid: false, reason: 'malformed_header' });
        });

        it('rejects a missing secret', () => {
            expect(verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: '',
                signatureHeader: sign(BODY),
            })).toEqual({ valid: false, reason: 'missing_secret' });
        });

        it('does not throw on a too-short base64 token (regression: timingSafeEqual length mismatch)', () => {
            // Prior bug: comparing the base64 STRING buffer to the decoded
            // buffer would throw; the throw was swallowed and reported as
            // an unrelated failure. Now the length-mismatch branch must
            // be a clean `signature_mismatch`, not a crash.
            expect(() =>
                verifyWebhookSignature({
                    webhookId: WID,
                    timestamp: TS,
                    rawBody: BODY,
                    secret: SECRET,
                    signatureHeader: 'v1,deadbeef',
                })
            ).not.toThrow();
            const result = verifyWebhookSignature({
                webhookId: WID,
                timestamp: TS,
                rawBody: BODY,
                secret: SECRET,
                signatureHeader: 'v1,deadbeef',
            });
            expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
        });

        // ── Fixture-driven (locks the verifier to the published vectors) ──

        it('matches fixture: signature/valid-fresh-signature → valid', () => {
            const fx = loadFixture('valid-fresh-signature');
            const result = verifyWebhookSignature({
                webhookId: fx.headers['webhook-id'],
                timestamp: fx.headers['webhook-timestamp'],
                rawBody: fx.body,
                secret: fx.secret,
                signatureHeader: fx.headers['webhook-signature'],
            });
            expect(result.valid).toBe(fx.expected.valid);
            expect(result.reason).toBe('ok');
        });

        it('matches fixture: signature/wrong-secret → invalid (signature_mismatch)', () => {
            const fx = loadFixture('wrong-secret');
            const result = verifyWebhookSignature({
                webhookId: fx.headers['webhook-id'],
                timestamp: fx.headers['webhook-timestamp'],
                rawBody: fx.body,
                secret: fx.secret,
                signatureHeader: fx.headers['webhook-signature'],
            });
            expect(result.valid).toBe(fx.expected.valid);
            expect(result.reason).toBe('signature_mismatch');
        });

        it('matches fixture: signature/multi-signature-header → valid via second token', () => {
            const fx = loadFixture('multi-signature-header');
            const result = verifyWebhookSignature({
                webhookId: fx.headers['webhook-id'],
                timestamp: fx.headers['webhook-timestamp'],
                rawBody: fx.body,
                secret: fx.secret,
                signatureHeader: fx.headers['webhook-signature'],
            });
            expect(result.valid).toBe(fx.expected.valid);
            expect(result.reason).toBe('ok_via_multi_signature');
        });
    });
});
