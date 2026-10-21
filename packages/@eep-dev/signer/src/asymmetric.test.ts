import { describe, expect, it } from 'vitest';
import {
    generateSigningKeyPair,
    signEd25519,
    verifyEd25519,
    toJwks,
    EEPAsymmetricError,
    PRIVATE_KEY_PREFIX,
    PUBLIC_KEY_PREFIX,
    ED25519_SIGNATURE_VERSION,
} from './asymmetric.js';
import { EEPSigner } from './index.js';

const WEBHOOK_ID = 'msg_01HN3QK7GX';
const TS_ = '1708123456';
const BODY = '{"specversion":"1.0","id":"evt-1"}';

describe('Ed25519 delivery signatures (§5.3.1)', () => {
    it('generates a key pair in the Standard Webhooks encoding', () => {
        const { privateKey, publicKey } = generateSigningKeyPair();
        expect(privateKey.startsWith(PRIVATE_KEY_PREFIX)).toBe(true);
        expect(publicKey.startsWith(PUBLIC_KEY_PREFIX)).toBe(true);
        // Raw Ed25519 keys are 32 bytes.
        expect(Buffer.from(privateKey.slice(PRIVATE_KEY_PREFIX.length), 'base64')).toHaveLength(32);
        expect(Buffer.from(publicKey.slice(PUBLIC_KEY_PREFIX.length), 'base64')).toHaveLength(32);
    });

    it('round-trips sign and verify', () => {
        const { privateKey, publicKey } = generateSigningKeyPair();
        const sig = signEd25519(privateKey, WEBHOOK_ID, TS_, BODY);
        expect(sig.startsWith(`${ED25519_SIGNATURE_VERSION},`)).toBe(true);
        expect(verifyEd25519(publicKey, WEBHOOK_ID, TS_, sig, BODY).valid).toBe(true);
    });

    // The whole point: only the holder of the private key can produce a valid
    // signature, so a subscriber cannot forge events attributed to the
    // publisher the way it can under a shared HMAC secret.
    it('does not verify under a different key pair', () => {
        const a = generateSigningKeyPair();
        const b = generateSigningKeyPair();
        const sig = signEd25519(a.privateKey, WEBHOOK_ID, TS_, BODY);
        expect(verifyEd25519(b.publicKey, WEBHOOK_ID, TS_, sig, BODY).valid).toBe(false);
    });

    it.each([
        ['a tampered body', () => ({ body: `${BODY} ` })],
        ['a different webhook id', () => ({ webhookId: 'msg_other' })],
        ['a different timestamp', () => ({ timestamp: '1708123999' })],
    ])('rejects %s', (_label, mutate) => {
        const { privateKey, publicKey } = generateSigningKeyPair();
        const sig = signEd25519(privateKey, WEBHOOK_ID, TS_, BODY);
        const m = mutate() as { body?: string; webhookId?: string; timestamp?: string };
        const result = verifyEd25519(
            publicKey,
            m.webhookId ?? WEBHOOK_ID,
            m.timestamp ?? TS_,
            sig,
            m.body ?? BODY
        );
        expect(result.valid).toBe(false);
    });

    describe('key ids and rotation', () => {
        it('carries a kid through the signature token', () => {
            const { privateKey, publicKey } = generateSigningKeyPair();
            const sig = signEd25519(privateKey, WEBHOOK_ID, TS_, BODY, 'key-2026-08');
            const result = verifyEd25519(publicKey, WEBHOOK_ID, TS_, sig, BODY);
            expect(result).toEqual({ valid: true, keyId: 'key-2026-08' });
        });

        // During rotation a publisher signs with both keys; a receiver holding
        // either one must still verify.
        it('verifies a dual-signed delivery with either key', () => {
            const outgoing = generateSigningKeyPair();
            const incoming = generateSigningKeyPair();
            const header = [
                signEd25519(outgoing.privateKey, WEBHOOK_ID, TS_, BODY, 'old'),
                signEd25519(incoming.privateKey, WEBHOOK_ID, TS_, BODY, 'new'),
            ].join(' ');
            expect(verifyEd25519(outgoing.publicKey, WEBHOOK_ID, TS_, header, BODY).valid).toBe(true);
            expect(verifyEd25519(incoming.publicKey, WEBHOOK_ID, TS_, header, BODY).valid).toBe(true);
        });

        it('accepts a key set and picks the one that verifies', () => {
            const wrong = generateSigningKeyPair();
            const right = generateSigningKeyPair();
            const sig = signEd25519(right.privateKey, WEBHOOK_ID, TS_, BODY);
            expect(verifyEd25519([wrong.publicKey, right.publicKey], WEBHOOK_ID, TS_, sig, BODY).valid).toBe(true);
        });

        // One bad entry in a configured key set must not stop the good ones
        // from being tried.
        it('skips a malformed configured key rather than aborting', () => {
            const { privateKey, publicKey } = generateSigningKeyPair();
            const sig = signEd25519(privateKey, WEBHOOK_ID, TS_, BODY);
            expect(verifyEd25519(['whpk_not-a-key', publicKey], WEBHOOK_ID, TS_, sig, BODY).valid).toBe(true);
        });
    });

    describe('coexistence with HMAC', () => {
        // A dual-signed delivery carries both schemes. Each verifier must
        // ignore the other's token instead of failing on it.
        const SECRET = 'this-is-a-test-secret-at-least-16';

        it('ignores HMAC tokens when verifying Ed25519', () => {
            const { privateKey, publicKey } = generateSigningKeyPair();
            const header = [
                new EEPSigner(SECRET).sign(WEBHOOK_ID, TS_, BODY),
                signEd25519(privateKey, WEBHOOK_ID, TS_, BODY),
            ].join(' ');
            expect(verifyEd25519(publicKey, WEBHOOK_ID, TS_, header, BODY).valid).toBe(true);
        });

        it('returns false when only HMAC tokens are present', () => {
            const { publicKey } = generateSigningKeyPair();
            const header = new EEPSigner(SECRET).sign(WEBHOOK_ID, TS_, BODY);
            expect(verifyEd25519(publicKey, WEBHOOK_ID, TS_, header, BODY).valid).toBe(false);
        });
    });

    describe('hostile input', () => {
        it.each([
            ['an empty header', ''],
            ['a truncated signature', 'v1a,AAAA'],
            ['a non-base64 signature', 'v1a,!!!!'],
            ['an unknown scheme', 'v9,AAAA'],
        ])('returns false, and does not throw, for %s', (_label, header) => {
            const { publicKey } = generateSigningKeyPair();
            expect(() => verifyEd25519(publicKey, WEBHOOK_ID, TS_, header, BODY)).not.toThrow();
            expect(verifyEd25519(publicKey, WEBHOOK_ID, TS_, header, BODY).valid).toBe(false);
        });

        it('returns false when no keys are configured', () => {
            const { privateKey } = generateSigningKeyPair();
            const sig = signEd25519(privateKey, WEBHOOK_ID, TS_, BODY);
            expect(verifyEd25519([], WEBHOOK_ID, TS_, sig, BODY).valid).toBe(false);
        });

        it.each([
            ['no prefix', 'AAAA'],
            ['wrong prefix', 'whpk_AAAA'],
        ])('throws a typed error when signing with %s', (_label, key) => {
            expect(() => signEd25519(key, WEBHOOK_ID, TS_, BODY)).toThrow(EEPAsymmetricError);
        });
    });

    describe('JWKS rendering', () => {
        it('renders a publishable key set', () => {
            const { publicKey } = generateSigningKeyPair();
            const jwks = toJwks([{ publicKey, keyId: 'key-1' }]);
            expect(jwks.keys).toHaveLength(1);
            expect(jwks.keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519', use: 'sig', alg: 'EdDSA', kid: 'key-1' });
            // RFC 8037: JWK `x` is base64url without padding.
            expect(jwks.keys[0]!.x).not.toContain('=');
            expect(jwks.keys[0]!.x).not.toContain('+');
            expect(jwks.keys[0]!.x).not.toContain('/');
        });

        it('renders several keys so a rotation is visible to subscribers', () => {
            const a = generateSigningKeyPair();
            const b = generateSigningKeyPair();
            const jwks = toJwks([
                { publicKey: a.publicKey, keyId: 'old' },
                { publicKey: b.publicKey, keyId: 'new' },
            ]);
            expect(jwks.keys.map((k) => k.kid)).toEqual(['old', 'new']);
        });

        it('omits kid when none was supplied', () => {
            const { publicKey } = generateSigningKeyPair();
            expect(toJwks([{ publicKey }]).keys[0]).not.toHaveProperty('kid');
        });
    });
});
