import { createHmac, timingSafeEqual } from 'crypto';

/**
 * @eep-dev/signer
 *
 * Standard Webhooks HMAC-SHA256 signing and verification for EEP-compliant platforms.
 *
 * This implements the signature algorithm defined in EEP SPECIFICATION.md §5.3.
 * The signed content is: `{webhook-id}.{webhook-timestamp}.{raw-body}`
 *
 * @see https://eep.dev/docs/current/security.md#2-webhook-security-hmac-sha256-standard-webhooks
 * @see https://www.standardwebhooks.com/
 */

export class EEPSigner {
    private readonly secret: string;

    /**
     * @param secret - The delivery_secret for this subscription.
     *                 Store this securely; never log or expose it.
     */
    constructor(secret: string) {
        if (!secret || secret.length < 16) {
            throw new Error('EEPSigner: secret must be at least 16 characters long');
        }
        this.secret = secret;
    }

    /**
     * Sign a webhook payload.
     *
     * @param webhookId - A unique message ID (e.g., `msg_01HN3QK7GX`). Must be unique per delivery.
     * @param timestamp - Unix timestamp in seconds (e.g., `Math.floor(Date.now() / 1000).toString()`).
     * @param rawBody - The raw JSON string of the request body. Must NOT be re-serialized.
     * @returns The value for the `webhook-signature` header (e.g., `v1,BASE64_ENCODED_HMAC`).
     */
    sign(webhookId: string, timestamp: string, rawBody: string): string {
        const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
        const hmac = createHmac('sha256', this.secret)
            .update(signedContent, 'utf8')
            .digest('base64');
        return `v1,${hmac}`;
    }

    /**
     * Verify a webhook payload's signature.
     *
     * This method performs timing-safe comparison to prevent timing attacks.
     * It also validates that the timestamp is within the 60-second replay window
     * (per EEP whitepaper §Security — normative requirement).
     *
     * @param webhookId - From the `webhook-id` request header.
     * @param timestamp - From the `webhook-timestamp` request header.
     * @param signature - From the `webhook-signature` request header.
     * @param rawBody - The raw request body as a string (parse AFTER verifying).
     * @param toleranceSeconds - Max age of the timestamp in seconds. Default: 60 (per EEP whitepaper §Security).
     * @returns `true` if the signature is valid and the timestamp is fresh.
     * @throws {EEPSignatureError} if the signature format is invalid.
     */
    verify(
        webhookId: string,
        timestamp: string,
        signature: string,
        rawBody: string,
        toleranceSeconds = 60
    ): boolean {
        // 1. Validate timestamp freshness (replay attack prevention)
        const timestampNum = parseInt(timestamp, 10);
        if (isNaN(timestampNum)) {
            throw new EEPSignatureError('Invalid webhook-timestamp: not a number');
        }

        const ageSeconds = Math.floor(Date.now() / 1000) - timestampNum;
        if (Math.abs(ageSeconds) > toleranceSeconds) {
            throw new EEPSignatureError(
                `webhook-timestamp is outside the ${toleranceSeconds}s tolerance window (age: ${ageSeconds}s)`
            );
        }

        // 2. Compute expected signature
        const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
        const expectedHmac = createHmac('sha256', this.secret)
            .update(signedContent, 'utf8')
            .digest('base64');
        const expected = Buffer.from(`v1,${expectedHmac}`);

        // 3. Parse and compare incoming signature (timing-safe)
        // The header may contain multiple signatures: "v1,sig1 v1,sig2"
        const signatures = signature.split(' ');
        for (const sig of signatures) {
            const incoming = Buffer.from(sig);
            if (incoming.length === expected.length &&
                timingSafeEqual(incoming, expected)) {
                return true;
            }
        }

        return false;
    }
}

/**
 * Thrown when a webhook signature is structurally invalid (bad format, expired timestamp, etc.)
 * Distinguished from a simple verification failure (wrong signature) which returns `false`.
 */
export class EEPSignatureError extends Error {
    constructor(message: string) {
        super(`EEPSignatureError: ${message}`);
        this.name = 'EEPSignatureError';
    }
}

/**
 * Convenience function: verify a webhook in an Express/Hono handler.
 *
 * @example
 * ```typescript
 * import { verifyEEPWebhook } from '@eep-dev/signer';
 *
 * app.post('/hooks/eep', express.raw({ type: 'application/json' }), (req, res) => {
 *   const valid = verifyEEPWebhook(req.body.toString(), req.headers, process.env.EEP_SECRET!);
 *   if (!valid) return res.status(401).json({ error: 'Invalid signature' });
 *   // ... process event
 * });
 * ```
 */
export function verifyEEPWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
): boolean {
    const webhookId = getHeader(headers, 'webhook-id');
    const timestamp = getHeader(headers, 'webhook-timestamp');
    const signature = getHeader(headers, 'webhook-signature');

    if (!webhookId || !timestamp || !signature) {
        return false;
    }

    try {
        const signer = new EEPSigner(secret);
        return signer.verify(webhookId, timestamp, signature, rawBody);
    } catch {
        return false;
    }
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const value = headers[key];
    if (!value) return null;
    return Array.isArray(value) ? value[0] : value;
}
