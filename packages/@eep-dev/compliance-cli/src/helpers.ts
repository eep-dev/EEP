/**
 * @eep-dev/compliance-cli — Testable helper utilities
 *
 * This module extracts pure, testable functions from the CLI.
 * The main CLI entry point (index.ts) imports from here.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TestResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    detail?: string;
}

/**
 * Create a test result collector.
 * Returns { pass, fail, skip, results, summary }.
 */
export function createTestRunner() {
    const results: TestResult[] = [];

    function pass(name: string, detail?: string) {
        results.push({ name, status: 'pass', detail });
    }

    function fail(name: string, detail: string) {
        results.push({ name, status: 'fail', detail });
    }

    function skip(name: string, reason: string) {
        results.push({ name, status: 'skip', detail: reason });
    }

    function summary() {
        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;
        const skipped = results.filter(r => r.status === 'skip').length;
        return { passed, failed, skipped, total: results.length };
    }

    function conformanceLabel(level: string): string {
        const { passed, failed, skipped } = summary();
        const lvl = level.charAt(0).toUpperCase() + level.slice(1);
        if (failed > 0) {
            return `❌ Not EEP Compliant (${failed} failure${failed !== 1 ? 's' : ''})`;
        }
        // A conformance claim must be *earned*, not granted by omission. A run
        // with zero passing checks, or with skipped checks, has not actually
        // verified the level — so it must not receive a compliance medal even
        // though `failed === 0`. (Otherwise a near-empty or fully-skipped run
        // would print "Full EEP Compliant".)
        if (passed === 0) {
            return '❌ Not EEP Compliant (no checks verified)';
        }
        if (skipped > 0) {
            return `⚠️ ${lvl} EEP: incomplete (${skipped} skipped, ${passed} passed)`;
        }
        const labels: Record<string, string> = {
            core: '🥉 Core EEP Compliant',
            standard: '🥈 Standard EEP Compliant',
            full: '🏆 Full EEP Compliant',
        };
        return labels[level] ?? `✅ ${lvl} EEP Compliant`;
    }

    return { pass, fail, skip, results, summary, conformanceLabel };
}

/**
 * Validate CLI arguments.
 * Returns an error message string if invalid, null if valid.
 */
export function validateArgs(args: {
    target?: string;
    level?: string;
    port?: string;
}): string | null {
    if (!args.target) {
        return 'Missing required argument: --target';
    }
    if (args.level && !['core', 'standard', 'full'].includes(args.level)) {
        return `Invalid conformance level: '${args.level}'. Must be one of: core, standard, full`;
    }
    if (args.port) {
        const port = parseInt(args.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return `Invalid port: '${args.port}'. Must be a number between 1 and 65535`;
        }
    }
    return null;
}

/**
 * Normalize a target URL by stripping trailing slashes.
 */
export function normalizeTarget(url: string): string {
    return url.replace(/\/+$/, '');
}

/**
 * Validate a CloudEvents envelope has the required EEP fields.
 * Returns an array of missing field names (empty = valid).
 */
export function validateCloudEventsEnvelope(event: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const requiredFields = ['specversion', 'id', 'source', 'type', 'time'];
    for (const field of requiredFields) {
        if (!event[field]) missing.push(field);
    }
    if (event.specversion !== '1.0') {
        missing.push('specversion (must be "1.0")');
    }
    return missing;
}

/**
 * Validate that EEP extension attributes are present.
 * Returns an array of missing attribute names.
 */
export function validateEEPExtensions(event: Record<string, unknown>): string[] {
    const missing: string[] = [];
    if (!event.eep_version) missing.push('eep_version');
    return missing;
}

/**
 * Outcome of a Standard Webhooks v1 signature verification, with a
 * structured `reason` field so the CLI can report *why* a signature
 * failed (not just "could not compare").
 *
 * Reasons:
 * - `ok`                       — single v1 signature matched.
 * - `ok_via_multi_signature`   — header carried multiple v1 tokens
 *                                (secret rotation); one of them matched.
 * - `missing_secret`           — the verifier was called without a secret.
 * - `malformed_header`         — header was empty / not a string.
 * - `no_v1_token`              — header contained no `v1,<base64>` token
 *                                (e.g. only future schemes like `v2,…`).
 * - `signature_mismatch`       — at least one v1 token was parseable but
 *                                none matched the expected HMAC.
 */
export type SignatureVerificationReason =
    | 'ok'
    | 'ok_via_multi_signature'
    | 'missing_secret'
    | 'malformed_header'
    | 'no_v1_token'
    | 'signature_mismatch';

export interface SignatureVerification {
    valid: boolean;
    reason: SignatureVerificationReason;
}

/**
 * Verify a Standard Webhooks v1 HMAC-SHA256 signature against a payload,
 * matching the algorithm in `@eep-dev/signer` (EEP SPECIFICATION.md §5.3).
 *
 * Kept dependency-free so the conformance CLI can verify arbitrary
 * implementations without coupling its publish cadence to `@eep-dev/signer`.
 *
 * Algorithm:
 *   signed_content = `${webhook-id}.${webhook-timestamp}.${raw-body}`
 *   token          = `v1,${base64(HMAC-SHA256(secret, signed_content))}`
 *
 * The header MAY contain space-separated tokens (secret rotation), e.g.
 * `v1,sigA v1,sigB`. Non-v1 schemes are ignored. Comparison is timing-safe:
 * both sides are reduced to equal-length raw digest buffers before
 * `crypto.timingSafeEqual`.
 *
 * Earlier revisions compared a base64-encoded string buffer against a
 * base64-decoded raw buffer; `timingSafeEqual` throws on mismatched byte
 * lengths and the throw was silently caught — meaning every conformance
 * run reported HMAC as "could not compare". Do not regress: tests in
 * `helpers.test.ts` exercise the fixtures under
 * `tests/conformance-fixtures/signature/`.
 *
 * @param args.webhookId        Value of the `webhook-id` request header.
 * @param args.timestamp        Value of the `webhook-timestamp` header.
 * @param args.rawBody          Raw request body bytes as the sender hashed
 *                              them (do NOT re-serialize a parsed object).
 * @param args.secret           The subscription's `delivery_secret`.
 * @param args.signatureHeader  Value of the `webhook-signature` header.
 */
export function verifyWebhookSignature(args: {
    webhookId: string;
    timestamp: string;
    rawBody: string;
    secret: string;
    signatureHeader: string;
}): SignatureVerification {
    if (!args.secret) {
        return { valid: false, reason: 'missing_secret' };
    }
    if (typeof args.signatureHeader !== 'string' || args.signatureHeader.length === 0) {
        return { valid: false, reason: 'malformed_header' };
    }

    const signedContent = `${args.webhookId}.${args.timestamp}.${args.rawBody}`;
    const expectedDigest = createHmac('sha256', args.secret)
        .update(signedContent, 'utf8')
        .digest();

    const tokens = args.signatureHeader.split(' ').filter((t) => t.length > 0);
    const v1Tokens = tokens.filter((t) => t.startsWith('v1,'));
    if (v1Tokens.length === 0) {
        return { valid: false, reason: 'no_v1_token' };
    }

    for (const token of v1Tokens) {
        const incoming = Buffer.from(token.slice('v1,'.length), 'base64');
        if (incoming.length !== expectedDigest.length) {
            continue;
        }
        if (timingSafeEqual(incoming, expectedDigest)) {
            return {
                valid: true,
                reason: v1Tokens.length > 1 ? 'ok_via_multi_signature' : 'ok',
            };
        }
    }

    return { valid: false, reason: 'signature_mismatch' };
}

/**
 * Check if Standard Webhooks headers are present.
 * Returns { hasId, hasTimestamp, hasSignature, missing[] }.
 */
export function checkWebhookHeaders(headers: Record<string, string | undefined>): {
    hasId: boolean;
    hasTimestamp: boolean;
    hasSignature: boolean;
    missing: string[];
} {
    const hasId = !!headers['webhook-id'];
    const hasTimestamp = !!headers['webhook-timestamp'];
    const hasSignature = !!headers['webhook-signature'];
    const missing: string[] = [];
    if (!hasId) missing.push('webhook-id');
    if (!hasTimestamp) missing.push('webhook-timestamp');
    if (!hasSignature) missing.push('webhook-signature');
    return { hasId, hasTimestamp, hasSignature, missing };
}
