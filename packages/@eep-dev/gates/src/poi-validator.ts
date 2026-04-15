/**
 * @eep-dev/gates — Proof-of-Intent (PoI) Validator
 *
 * Validates IntentDocument signatures and scope boundaries to prevent
 * Confused Deputy and Logic Prompt Control Injection (LPCI) attacks.
 *
 * As described in EEP WHITEPAPER.tex Section 12.
 */

import type { IntentDocument, ProofOfIntent } from './types.js';

// ── Structural Validation ─────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof IntentDocument)[] = [
    'intent_id',
    'agent_did',
    'principal_did',
    'action',
    'scope',
    'principal_signature',
    'created_at',
];

/**
 * Validate an IntentDocument structurally (fields, freshness, scope shape).
 * Semantic validation (signature crypto) is left to the platform.
 */
export function validateIntentDocument(doc: IntentDocument, agentDid: string): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // 1. Required fields
    for (const field of REQUIRED_FIELDS) {
        if (doc[field] === undefined || doc[field] === null || doc[field] === '') {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // 2. Agent DID must match
    if (doc.agent_did && doc.agent_did !== agentDid) {
        errors.push(
            `agent_did mismatch: expected "${agentDid}", got "${doc.agent_did}"`
        );
    }

    // 3. Expiry check
    if (doc.scope?.expires_at) {
        const expiry = new Date(doc.scope.expires_at).getTime();
        if (Number.isNaN(expiry)) {
            errors.push('scope.expires_at is not a valid ISO8601 date');
        } else if (expiry < Date.now()) {
            errors.push(
                `Intent document expired at ${doc.scope.expires_at}`
            );
        }
    } else {
        errors.push('scope.expires_at is required');
    }

    // 4. created_at must be parseable and in the past
    if (doc.created_at) {
        const created = new Date(doc.created_at).getTime();
        if (Number.isNaN(created)) {
            errors.push('created_at is not a valid ISO8601 date');
        } else if (created > Date.now() + 30_000) {
            // Allow 30-second clock skew
            errors.push('created_at is in the future — potential replay attack');
        }
    }

    // 5. principal_signature must be non-empty hex or base64 string
    if (doc.principal_signature && !/^[0-9a-fA-F]{64,}$|^[A-Za-z0-9+/=]{88,}$/.test(doc.principal_signature)) {
        errors.push(
            'principal_signature does not appear to be valid hex or base64'
        );
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Check whether a proposed resource access and optional spend amount
 * falls within the bounds declared in the IntentDocument's scope.
 */
export function isWithinScope(
    resource: string,
    amount: number | undefined,
    doc: IntentDocument
): { allowed: boolean; reason?: string } {
    const { scope } = doc;

    // 1. Amount check
    if (amount !== undefined && scope.max_amount !== undefined) {
        if (amount > scope.max_amount) {
            return {
                allowed: false,
                reason: `Requested amount ${amount} ${scope.currency ?? ''} exceeds PoI max_amount ${scope.max_amount}`,
            };
        }
    }

    // 2. Resource glob check
    if (scope.allowed_resources && scope.allowed_resources.length > 0) {
        const match = scope.allowed_resources.some(pattern =>
            matchGlob(pattern, resource)
        );
        if (!match) {
            return {
                allowed: false,
                reason: `Resource "${resource}" is not covered by any allowed_resources pattern in the PoI`,
            };
        }
    }

    return { allowed: true };
}

/**
 * Validate a ProofOfIntent gate proof (structural only).
 */
export function validatePoIProof(
    proof: ProofOfIntent,
    agentDid: string
): { valid: boolean; errors: string[] } {
    if (proof.type !== 'proof_of_intent') {
        return { valid: false, errors: ['Proof type must be "proof_of_intent"'] };
    }
    if (!proof.intent_document) {
        return { valid: false, errors: ['intent_document is required in ProofOfIntent'] };
    }
    return validateIntentDocument(proof.intent_document, agentDid);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Very simple glob matcher that supports `*` and `**` wildcards.
 */
function matchGlob(pattern: string, value: string): boolean {
    const re = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\uFFFD')
        .replace(/\*/g, '[^/]*')
        .replace(/\uFFFD/g, '.*');
    return new RegExp(`^${re}$`).test(value);
}
