/**
 * Ed25519 asymmetric webhook signing (SPECIFICATION.md §5.3.1).
 *
 * EEP delivery signatures were HMAC-SHA256 only: publisher and subscriber
 * share one secret. Four consequences followed.
 *
 * 1. **No non-repudiation.** The subscriber holds the same key the publisher
 *    signs with, so it can forge any event and attribute it to the publisher.
 *    §15 defines a commerce state machine and §16 signed audit trails; both
 *    ride on this signature.
 * 2. **No third-party verification.** A regulator or counterparty cannot
 *    verify an audit entry without being handed the subscriber's signing
 *    secret — which would let them forge entries too.
 * 3. **No key rotation surface.** Rotation is manual per-subscription secret
 *    juggling, with no `kid` and no published key set.
 * 4. **PQC readiness stopped at the gate.** §11.7 defines algorithm
 *    negotiation including PQ-hybrid signatures, but only for agent→publisher
 *    *gate proofs*. The publisher→subscriber path — which carries every event
 *    the protocol exists to deliver — had no asymmetric option at all.
 *
 * Standard Webhooks, which `@eep-dev/signer` claims alignment with, already
 * specifies Ed25519 with `whsk_`/`whpk_` key prefixes and a published key set.
 * EEP implemented the symmetric half and inherited the claim for both.
 */
import {
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
    sign as nodeSign,
    verify as nodeVerify,
    type KeyObject,
} from 'node:crypto';

/** Standard Webhooks key prefixes. */
export const PRIVATE_KEY_PREFIX = 'whsk_';
export const PUBLIC_KEY_PREFIX = 'whpk_';

/** Signature scheme identifier carried in the `webhook-signature` header. */
export const ED25519_SIGNATURE_VERSION = 'v1a';

export class EEPAsymmetricError extends Error {
    constructor(message: string) {
        super(`EEPAsymmetricError: ${message}`);
        this.name = 'EEPAsymmetricError';
    }
}

export interface EEPKeyPair {
    /** Base64 raw private key, `whsk_`-prefixed. */
    privateKey: string;
    /** Base64 raw public key, `whpk_`-prefixed. */
    publicKey: string;
}

/** DER prefixes for raw Ed25519 keys, so we can move between raw and KeyObject. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Generate an Ed25519 key pair in the Standard Webhooks prefixed encoding. */
export function generateSigningKeyPair(): EEPKeyPair {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const rawPrivate = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(PKCS8_ED25519_PREFIX.length);
    const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_ED25519_PREFIX.length);
    return {
        privateKey: `${PRIVATE_KEY_PREFIX}${rawPrivate.toString('base64')}`,
        publicKey: `${PUBLIC_KEY_PREFIX}${rawPublic.toString('base64')}`,
    };
}

function decodeKey(value: string, prefix: string, label: string): Buffer {
    if (typeof value !== 'string' || !value.startsWith(prefix)) {
        throw new EEPAsymmetricError(`${label} must be a base64 string prefixed with '${prefix}'`);
    }
    const raw = Buffer.from(value.slice(prefix.length), 'base64');
    if (raw.length !== 32) {
        throw new EEPAsymmetricError(`${label} must decode to 32 bytes, got ${raw.length}`);
    }
    return raw;
}

function toPrivateKeyObject(privateKey: string): KeyObject {
    const raw = decodeKey(privateKey, PRIVATE_KEY_PREFIX, 'private key');
    return createPrivateKey({
        key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]),
        format: 'der',
        type: 'pkcs8',
    });
}

function toPublicKeyObject(publicKey: string): KeyObject {
    const raw = decodeKey(publicKey, PUBLIC_KEY_PREFIX, 'public key');
    return createPublicKey({
        key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
        format: 'der',
        type: 'spki',
    });
}

/**
 * Sign a delivery with Ed25519.
 *
 * The signed content is identical to the HMAC scheme —
 * `{webhook-id}.{webhook-timestamp}.{raw-body}` — so the two schemes differ
 * only in the key and the version tag. That keeps a dual-signing publisher
 * from having to build the payload twice, and keeps §5.3's replay rules
 * unchanged.
 */
export function signEd25519(
    privateKey: string,
    webhookId: string,
    timestamp: string,
    rawBody: string,
    keyId?: string
): string {
    const key = toPrivateKeyObject(privateKey);
    const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
    const signature = nodeSign(null, Buffer.from(signedContent, 'utf8'), key).toString('base64');
    // `kid` rides in the token so a receiver can select the right key from a
    // key set without trial-verifying against every published key.
    return keyId ? `${ED25519_SIGNATURE_VERSION},${keyId}:${signature}` : `${ED25519_SIGNATURE_VERSION},${signature}`;
}

export interface Ed25519VerifyResult {
    valid: boolean;
    /** Key id from the matching token, when one was present. */
    keyId?: string;
}

/**
 * Verify an Ed25519 delivery signature against one or more public keys.
 *
 * Accepts the space-delimited multi-signature header form, so a publisher can
 * sign with the outgoing and incoming key during a rotation and a receiver
 * that holds either still verifies. Tokens for other schemes (`v1,` HMAC) are
 * skipped rather than treated as failures — a dual-signed delivery carries
 * both, and rejecting it because one scheme is unrecognised would defeat the
 * point of dual-signing.
 */
export function verifyEd25519(
    publicKeys: string | string[],
    webhookId: string,
    timestamp: string,
    signatureHeader: string,
    rawBody: string
): Ed25519VerifyResult {
    if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
        return { valid: false };
    }
    const keys = (Array.isArray(publicKeys) ? publicKeys : [publicKeys]).filter(
        (k) => typeof k === 'string' && k.length > 0
    );
    if (keys.length === 0) return { valid: false };

    const signedContent = Buffer.from(`${webhookId}.${timestamp}.${rawBody}`, 'utf8');

    for (const token of signatureHeader.split(' ')) {
        if (!token.startsWith(`${ED25519_SIGNATURE_VERSION},`)) continue;
        const payload = token.slice(ED25519_SIGNATURE_VERSION.length + 1);
        const separator = payload.indexOf(':');
        const keyId = separator === -1 ? undefined : payload.slice(0, separator);
        const encoded = separator === -1 ? payload : payload.slice(separator + 1);

        let signature: Buffer;
        try {
            signature = Buffer.from(encoded, 'base64');
        } catch {
            continue;
        }
        // Ed25519 signatures are always 64 bytes; anything else cannot verify
        // and is not worth handing to the crypto layer.
        if (signature.length !== 64) continue;

        for (const publicKey of keys) {
            let keyObject: KeyObject;
            try {
                keyObject = toPublicKeyObject(publicKey);
            } catch {
                // A malformed configured key must not abort verification
                // against the remaining well-formed ones.
                continue;
            }
            try {
                if (nodeVerify(null, signedContent, keyObject, signature)) {
                    return keyId ? { valid: true, keyId } : { valid: true };
                }
            } catch {
                // Treat a crypto-layer rejection as a failed candidate, never
                // as an exception escaping to the caller: the input is
                // attacker-controlled.
            }
        }
    }

    return { valid: false };
}

export interface JwksKey {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid?: string;
    use: 'sig';
    alg: 'EdDSA';
}

/**
 * Render public keys as a JWKS document for `/.well-known/jwks.json`.
 *
 * Publishing the key set is what makes rotation an operation a subscriber can
 * follow without coordination: it re-reads the document and finds the new key
 * already there.
 */
export function toJwks(keys: Array<{ publicKey: string; keyId?: string }>): { keys: JwksKey[] } {
    return {
        keys: keys.map(({ publicKey, keyId }) => {
            const raw = decodeKey(publicKey, PUBLIC_KEY_PREFIX, 'public key');
            const jwk: JwksKey = {
                kty: 'OKP',
                crv: 'Ed25519',
                // JWK uses base64url without padding (RFC 8037).
                x: raw.toString('base64url'),
                use: 'sig',
                alg: 'EdDSA',
            };
            return keyId ? { ...jwk, kid: keyId } : jwk;
        }),
    };
}
