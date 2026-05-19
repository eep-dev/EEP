/**
 * @eep-dev/signer/web
 *
 * WebCrypto-based HMAC-SHA256 signer for runtimes without Node's `crypto`
 * module: Cloudflare Workers, Deno Deploy, browsers, Edge runtimes.
 *
 * This is API-equivalent to the Node `EEPSigner` in ./index.ts but
 * asynchronous (WebCrypto's `subtle.sign` and `subtle.verify` return
 * Promises). The wire format is identical: `v1,<base64-hmac>`.
 *
 * Use this for:
 *   - Cloudflare Workers / Pages Functions
 *   - Deno / Deno Deploy
 *   - Browsers (e.g. for testing webhook receivers in a sandbox)
 *   - Bun (Bun also exposes WebCrypto)
 *
 * If you are running on Node.js, prefer `EEPSigner` from the package
 * default entry — its sync API is simpler and slightly cheaper.
 */

const SUBTLE: SubtleCrypto =
    typeof globalThis.crypto !== 'undefined' && 'subtle' in globalThis.crypto
        ? globalThis.crypto.subtle
        : (() => {
              throw new Error(
                  'EEPWebSigner: globalThis.crypto.subtle is unavailable. ' +
                      'This runtime does not expose WebCrypto. Use EEPSigner from ' +
                      "'@eep-dev/signer' on Node.js, or upgrade to a runtime with " +
                      'WebCrypto support (Node ≥ 18, Bun, Deno, Cloudflare Workers).'
              );
          })();

const ENCODER = new TextEncoder();

export class EEPWebSigner {
    private readonly secret: string;
    private keyPromise: Promise<CryptoKey> | null = null;

    /**
     * @param secret - The delivery_secret for this subscription. Must be
     *                 ≥ 16 characters. Store this securely; never log or
     *                 expose it.
     */
    constructor(secret: string) {
        if (!secret || secret.length < 16) {
            throw new Error('EEPWebSigner: secret must be at least 16 characters long');
        }
        this.secret = secret;
    }

    private getKey(): Promise<CryptoKey> {
        if (!this.keyPromise) {
            this.keyPromise = SUBTLE.importKey(
                'raw',
                ENCODER.encode(this.secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign', 'verify']
            );
        }
        return this.keyPromise;
    }

    /**
     * Sign a webhook payload.
     *
     * @returns The value for the `webhook-signature` header (`v1,BASE64`).
     */
    async sign(webhookId: string, timestamp: string, rawBody: string): Promise<string> {
        const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
        const key = await this.getKey();
        const sigBuffer = await SUBTLE.sign('HMAC', key, ENCODER.encode(signedContent));
        return `v1,${bufferToBase64(sigBuffer)}`;
    }

    /**
     * Verify a webhook payload's signature using WebCrypto's verify
     * primitive (which is constant-time per its spec).
     *
     * @param toleranceSeconds - Replay window. Default 60 seconds.
     */
    async verify(
        webhookId: string,
        timestamp: string,
        signature: string,
        rawBody: string,
        toleranceSeconds = 60
    ): Promise<boolean> {
        const timestampNum = parseInt(timestamp, 10);
        if (Number.isNaN(timestampNum)) {
            throw new EEPWebSignatureError('Invalid webhook-timestamp: not a number');
        }
        const ageSeconds = Math.floor(Date.now() / 1000) - timestampNum;
        if (Math.abs(ageSeconds) > toleranceSeconds) {
            throw new EEPWebSignatureError(
                `webhook-timestamp is outside the ${toleranceSeconds}s tolerance window (age: ${ageSeconds}s)`
            );
        }

        const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
        const data = ENCODER.encode(signedContent);
        const key = await this.getKey();

        const candidates = signature.split(' ');
        for (const sig of candidates) {
            if (!sig.startsWith('v1,')) continue;
            const b64 = sig.slice(3);
            let raw: Uint8Array;
            try {
                raw = base64ToBuffer(b64);
            } catch {
                continue;
            }
            // `raw` is a Uint8Array<ArrayBufferLike>; @types/node >= 25 narrows
            // SubtleCrypto.verify to BufferSource (ArrayBufferView<ArrayBuffer>).
            const ok = await SUBTLE.verify('HMAC', key, raw as BufferSource, data);
            if (ok) return true;
        }
        return false;
    }
}

export class EEPWebSignatureError extends Error {
    constructor(message: string) {
        super(`EEPWebSignatureError: ${message}`);
        this.name = 'EEPWebSignatureError';
    }
}

/**
 * Convenience helper, async sibling of `verifyEEPWebhook`.
 */
export async function verifyEEPWebhookWeb(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
): Promise<boolean> {
    const webhookId = getHeader(headers, 'webhook-id');
    const timestamp = getHeader(headers, 'webhook-timestamp');
    const signature = getHeader(headers, 'webhook-signature');
    if (!webhookId || !timestamp || !signature) return false;
    try {
        const signer = new EEPWebSigner(secret);
        return await signer.verify(webhookId, timestamp, signature, rawBody);
    } catch {
        return false;
    }
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const value = headers[key];
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
}

function bufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    if (typeof btoa === 'function') return btoa(binary);
    // Fallback for environments without btoa (very rare on WebCrypto-capable runtimes).
    return Buffer.from(bytes).toString('base64');
}

function base64ToBuffer(b64: string): Uint8Array {
    if (typeof atob === 'function') {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
}
