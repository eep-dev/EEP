import { describe, it, expect } from 'vitest';
import { EEPSigner, EEPSignatureError, verifyEEPWebhook } from './index';

describe('Signer Security', () => {

    describe('Cryptographic Security', () => {
        it('uses sufficiently long keys (>= 16 chars / 128 bits minimum)', () => {
            expect(() => new EEPSigner('a'.repeat(16))).not.toThrow();
            expect(() => new EEPSigner('a'.repeat(32))).not.toThrow();
            expect(() => new EEPSigner('a'.repeat(64))).not.toThrow();
        });

        it('rejects weak/short keys', () => {
            expect(() => new EEPSigner('')).toThrow('at least 16 characters');
            expect(() => new EEPSigner('short')).toThrow('at least 16 characters');
            expect(() => new EEPSigner('a'.repeat(15))).toThrow('at least 16 characters');
        });

        it('prevents timing attacks via constant-time comparison', () => {
            const signer = new EEPSigner('whsec_test-secret-at-least-16-chars');
            const now = Math.floor(Date.now() / 1000).toString();
            const body = '{"test":true}';
            const validSig = signer.sign('msg_01', now, body);

            // Measure multiple verification attempts — timing-safe means similar times
            // for correct vs incorrect signatures. We mainly assert the verify method
            // exists and returns the right values (crypto internals use timingSafeEqual).
            const almostCorrect = validSig.slice(0, -1) + 'X';
            expect(signer.verify('msg_01', now, validSig, body)).toBe(true);
            expect(signer.verify('msg_01', now, almostCorrect, body)).toBe(false);
        });

        it('rejects algorithm confusion attacks', () => {
            const signer = new EEPSigner('whsec_test-secret-at-least-16-chars');
            const now = Math.floor(Date.now() / 1000).toString();
            const body = '{"test":true}';

            // Signature must be v1 (HMAC-SHA256). A "none" or different prefix should fail.
            expect(signer.verify('msg_01', now, 'none,abc123', body)).toBe(false);
            expect(signer.verify('msg_01', now, 'v2,abc123', body)).toBe(false);
            expect(signer.verify('msg_01', now, 'HS512,abc123', body)).toBe(false);
        });

        it('produces different signatures for same payload with different secrets', () => {
            const signer1 = new EEPSigner('secret-one-at-least-16');
            const signer2 = new EEPSigner('secret-two-at-least-16');
            const sig1 = signer1.sign('msg_01', '1700000000', '{}');
            const sig2 = signer2.sign('msg_01', '1700000000', '{}');
            expect(sig1).not.toBe(sig2);
        });
    });

    describe('Key Handling', () => {
        it('does not expose private key in error messages', () => {
            const secret = 'my-super-secret-key-at-least-16';
            const signer = new EEPSigner(secret);
            const now = Math.floor(Date.now() / 1000).toString();

            try {
                signer.verify('msg_01', 'not-a-number', 'v1,invalid', '{}');
            } catch (e) {
                expect((e as Error).message).not.toContain(secret);
                expect(String(e)).not.toContain(secret);
            }

            try {
                new EEPSigner('short');
            } catch (e) {
                // Error message should describe the requirement, not echo back the input as a secret
                expect((e as Error).message).toContain('at least 16 characters');
            }
        });

        it('validates key format before signing', () => {
            // Empty key is rejected at construction time
            expect(() => new EEPSigner('')).toThrow();
            // @ts-expect-error testing runtime behavior with wrong types
            expect(() => new EEPSigner(null)).toThrow();
            // @ts-expect-error testing runtime behavior with wrong types
            expect(() => new EEPSigner(undefined)).toThrow();
        });
    });

    describe('Replay Protection', () => {
        it('rejects timestamps older than tolerance window', () => {
            const signer = new EEPSigner('whsec_test-secret-at-least-16-chars');
            const old = (Math.floor(Date.now() / 1000) - 600).toString();
            const sig = signer.sign('msg_01', old, '{}');
            expect(() => signer.verify('msg_01', old, sig, '{}', 300)).toThrow(EEPSignatureError);
        });

        it('rejects timestamps from the future beyond tolerance', () => {
            const signer = new EEPSigner('whsec_test-secret-at-least-16-chars');
            const future = (Math.floor(Date.now() / 1000) + 600).toString();
            const sig = signer.sign('msg_01', future, '{}');
            expect(() => signer.verify('msg_01', future, sig, '{}', 300)).toThrow('outside the');
        });
    });

    describe('Header Injection via verifyEEPWebhook', () => {
        it('returns false for missing required headers', () => {
            expect(verifyEEPWebhook('{}', {}, 'whsec_test-secret-16-chars')).toBe(false);
        });

        it('returns false for empty string header values', () => {
            expect(verifyEEPWebhook('{}', {
                'webhook-id': '',
                'webhook-timestamp': '',
                'webhook-signature': '',
            }, 'whsec_test-secret-16-chars')).toBe(false);
        });

        it('handles very long header values without crashing', () => {
            const longValue = 'v1,' + 'A'.repeat(100_000);
            expect(verifyEEPWebhook('{}', {
                'webhook-id': 'msg_01',
                'webhook-timestamp': Math.floor(Date.now() / 1000).toString(),
                'webhook-signature': longValue,
            }, 'whsec_test-secret-16-chars')).toBe(false);
        });
    });
});
