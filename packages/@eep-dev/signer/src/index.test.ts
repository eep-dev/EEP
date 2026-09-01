import { describe, it, expect } from 'vitest';
import { EEPSigner, EEPSignatureError, verifyEEPWebhook } from './index';

describe('@eep-dev/signer', () => {
    const SECRET = 'whsec_test-secret-at-least-16-chars-long';
    const WEBHOOK_ID = 'msg_01HN3QK7GX';
    const TIMESTAMP = '1700000000';
    const BODY = '{"type":"com.example.entity.updated","data":{"id":"u/test"}}';

    describe('EEPSigner constructor', () => {
        it('should accept a valid secret', () => {
            expect(() => new EEPSigner(SECRET)).not.toThrow();
        });

        it('should reject short secrets', () => {
            expect(() => new EEPSigner('short')).toThrow('at least 16 characters');
        });

        it('should reject empty secrets', () => {
            expect(() => new EEPSigner('')).toThrow('at least 16 characters');
        });
    });

    describe('sign', () => {
        it('should return a v1 signature', () => {
            const signer = new EEPSigner(SECRET);
            const sig = signer.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            expect(sig).toMatch(/^v1,/);
        });

        it('should produce deterministic signatures', () => {
            const signer = new EEPSigner(SECRET);
            const sig1 = signer.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            const sig2 = signer.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            expect(sig1).toBe(sig2);
        });

        it('should produce different signatures for different bodies', () => {
            const signer = new EEPSigner(SECRET);
            const sig1 = signer.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            const sig2 = signer.sign(WEBHOOK_ID, TIMESTAMP, '{"different":"body"}');
            expect(sig1).not.toBe(sig2);
        });

        it('should produce different signatures for different webhook IDs', () => {
            const signer = new EEPSigner(SECRET);
            const sig1 = signer.sign('msg_01', TIMESTAMP, BODY);
            const sig2 = signer.sign('msg_02', TIMESTAMP, BODY);
            expect(sig1).not.toBe(sig2);
        });

        it('should produce different signatures for different secrets', () => {
            const signer1 = new EEPSigner(SECRET);
            const signer2 = new EEPSigner('whsec_another-secret-at-least-16');
            const sig1 = signer1.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            const sig2 = signer2.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            expect(sig1).not.toBe(sig2);
        });
    });

    describe('verify', () => {
        it('should verify a valid signature', () => {
            const signer = new EEPSigner(SECRET);
            const sig = signer.sign(WEBHOOK_ID, TIMESTAMP, BODY);
            // Use a fresh timestamp for verification
            const now = Math.floor(Date.now() / 1000).toString();
            const freshSig = signer.sign(WEBHOOK_ID, now, BODY);
            expect(signer.verify(WEBHOOK_ID, now, freshSig, BODY)).toBe(true);
        });

        it('should reject an invalid signature', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            expect(signer.verify(WEBHOOK_ID, now, 'v1,INVALID', BODY)).toBe(false);
        });

        it('should reject expired timestamps', () => {
            const signer = new EEPSigner(SECRET);
            const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
            const sig = signer.sign(WEBHOOK_ID, oldTimestamp, BODY);
            expect(() => signer.verify(WEBHOOK_ID, oldTimestamp, sig, BODY, 300))
                .toThrow(EEPSignatureError);
        });

        it('should reject non-numeric timestamps', () => {
            const signer = new EEPSigner(SECRET);
            expect(() => signer.verify(WEBHOOK_ID, 'not-a-number', 'v1,x', BODY))
                .toThrow('not a number');
        });

        it('should accept multiple signature values (space-separated)', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            const validSig = signer.sign(WEBHOOK_ID, now, BODY);
            const multiSig = `v1,WRONG_SIG ${validSig}`;
            expect(signer.verify(WEBHOOK_ID, now, multiSig, BODY)).toBe(true);
        });

        it('should handle custom tolerance', () => {
            const signer = new EEPSigner(SECRET);
            const recentTimestamp = (Math.floor(Date.now() / 1000) - 10).toString();
            const sig = signer.sign(WEBHOOK_ID, recentTimestamp, BODY);
            expect(signer.verify(WEBHOOK_ID, recentTimestamp, sig, BODY, 60)).toBe(true);
        });
    });

    describe('verifyEEPWebhook convenience', () => {
        it('should verify a webhook with correct headers', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            const sig = signer.sign(WEBHOOK_ID, now, BODY);

            const valid = verifyEEPWebhook(BODY, {
                'webhook-id': WEBHOOK_ID,
                'webhook-timestamp': now,
                'webhook-signature': sig,
            }, SECRET);

            expect(valid).toBe(true);
        });

        it('should return false for missing headers', () => {
            expect(verifyEEPWebhook(BODY, {}, SECRET)).toBe(false);
        });

        it('should return false for invalid signature', () => {
            const now = Math.floor(Date.now() / 1000).toString();
            expect(verifyEEPWebhook(BODY, {
                'webhook-id': WEBHOOK_ID,
                'webhook-timestamp': now,
                'webhook-signature': 'v1,tampered',
            }, SECRET)).toBe(false);
        });

        it('should handle array header values', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            const sig = signer.sign(WEBHOOK_ID, now, BODY);

            const valid = verifyEEPWebhook(BODY, {
                'webhook-id': [WEBHOOK_ID],
                'webhook-timestamp': [now],
                'webhook-signature': [sig],
            }, SECRET);

            expect(valid).toBe(true);
        });

        it('should return false for expired timestamps', () => {
            const signer = new EEPSigner(SECRET);
            const old = '1000000000'; // way in the past
            const sig = signer.sign(WEBHOOK_ID, old, BODY);

            expect(verifyEEPWebhook(BODY, {
                'webhook-id': WEBHOOK_ID,
                'webhook-timestamp': old,
                'webhook-signature': sig,
            }, SECRET)).toBe(false);
        });
    });

    describe('EEPSignatureError', () => {
        it('should have correct name', () => {
            const err = new EEPSignatureError('test');
            expect(err.name).toBe('EEPSignatureError');
        });

        it('should include prefix in message', () => {
            const err = new EEPSignatureError('test message');
            expect(err.message).toContain('EEPSignatureError:');
            expect(err.message).toContain('test message');
        });

        it('should be an instance of Error', () => {
            const err = new EEPSignatureError('test');
            expect(err).toBeInstanceOf(Error);
        });
    });

    describe('edge cases', () => {
        it('should sign empty body', () => {
            const signer = new EEPSigner(SECRET);
            const sig = signer.sign(WEBHOOK_ID, TIMESTAMP, '');
            expect(sig).toMatch(/^v1,/);
        });

        it('should reject future timestamps beyond tolerance', () => {
            const signer = new EEPSigner(SECRET);
            const futureTimestamp = (Math.floor(Date.now() / 1000) + 600).toString();
            const sig = signer.sign(WEBHOOK_ID, futureTimestamp, BODY);
            expect(() => signer.verify(WEBHOOK_ID, futureTimestamp, sig, BODY, 300))
                .toThrow('outside the');
        });

        it('should return false when only webhook-id header is present', () => {
            expect(verifyEEPWebhook(BODY, {
                'webhook-id': WEBHOOK_ID,
            }, SECRET)).toBe(false);
        });

        it('should handle undefined header value gracefully', () => {
            expect(verifyEEPWebhook(BODY, {
                'webhook-id': undefined,
                'webhook-timestamp': undefined,
                'webhook-signature': undefined,
            }, SECRET)).toBe(false);
        });

        it('should sign and verify very long body', () => {
            const signer = new EEPSigner(SECRET);
            const longBody = JSON.stringify({ data: 'x'.repeat(10000) });
            const now = Math.floor(Date.now() / 1000).toString();
            const sig = signer.sign(WEBHOOK_ID, now, longBody);
            expect(signer.verify(WEBHOOK_ID, now, sig, longBody)).toBe(true);
        });

        it('should handle signature with wrong length (Buffer mismatch)', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            // A very short base64 string that decodes to different length than expected HMAC
            const shortSig = 'v1,YQ==';
            expect(signer.verify(WEBHOOK_ID, now, shortSig, BODY)).toBe(false);
        });

        // Regression guard for SPECIFICATION.md §5.3 requirement 2: a
        // truncated prefix of the *correct* signature is the input that
        // makes an unguarded `timingSafeEqual` raise RangeError. Verifying
        // it MUST return false, never throw — otherwise attacker-controlled
        // bytes turn a 401 into a 500. Mirrors the conformance fixture
        // `tests/conformance-fixtures/signature/truncated-signature`.
        it('should return false, not throw, for a truncated valid signature', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            const real = signer.sign(WEBHOOK_ID, now, BODY);
            for (const cut of [4, 10, 20, real.length - 1]) {
                const truncated = real.slice(0, cut);
                expect(() => signer.verify(WEBHOOK_ID, now, truncated, BODY)).not.toThrow();
                expect(signer.verify(WEBHOOK_ID, now, truncated, BODY)).toBe(false);
            }
        });

        // Same guarantee for a signature that is LONGER than expected.
        it('should return false, not throw, for an over-long signature', () => {
            const signer = new EEPSigner(SECRET);
            const now = Math.floor(Date.now() / 1000).toString();
            const padded = signer.sign(WEBHOOK_ID, now, BODY) + 'AAAA';
            expect(() => signer.verify(WEBHOOK_ID, now, padded, BODY)).not.toThrow();
            expect(signer.verify(WEBHOOK_ID, now, padded, BODY)).toBe(false);
        });
    });
});
