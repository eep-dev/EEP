/**
 * @eep-dev/gates — Proof-of-Intent (PoI) Validator Tests
 *
 * Tests all validation paths in poi-validator.ts:
 * - Valid/expired IntentDocument
 * - Agent DID mismatch
 * - Scope: max_amount exceeded / resource out-of-glob
 * - Missing required fields
 * - validatePoIProof wrapper
 */

import { describe, it, expect } from 'vitest';
import { validateIntentDocument, isWithinScope, validatePoIProof } from './poi-validator.js';
import type { IntentDocument, ProofOfIntent } from './types.js';

const AGENT_DID = 'did:web:example.com:agent:007';
const PRINCIPAL_DID = 'did:web:principal.example.com';

function validDoc(overrides: Partial<IntentDocument> = {}): IntentDocument {
    return {
        intent_id: 'intent_01HXK',
        agent_did: AGENT_DID,
        principal_did: PRINCIPAL_DID,
        action: 'Purchase Bloomberg financial feed for daily briefing',
        scope: {
            max_amount: 250,
            currency: 'USDC',
            allowed_resources: ['data.finance.*', 'events.market.*'],
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
        principal_signature:
            '0x' + 'a'.repeat(130), // 130 hex chars — valid secp256k1 length
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

// ── validateIntentDocument ────────────────────────────────────────────────────

describe('validateIntentDocument', () => {
    it('accepts a valid, in-scope intent document', () => {
        const result = validateIntentDocument(validDoc(), AGENT_DID);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('rejects when agent_did does not match the caller', () => {
        const doc = validDoc({ agent_did: 'did:web:other.com' });
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('agent_did mismatch'))).toBe(true);
    });

    it('rejects an expired intent document', () => {
        const doc = validDoc({
            scope: {
                expires_at: new Date(Date.now() - 1000).toISOString(),
            },
        });
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('expired'))).toBe(true);
    });

    it('rejects when scope.expires_at is missing', () => {
        const doc = validDoc();
        (doc.scope as Record<string, unknown>).expires_at = undefined;
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('expires_at is required'))).toBe(true);
    });

    it('rejects when scope.expires_at is invalid ISO8601', () => {
        const doc = validDoc({ scope: { expires_at: 'not-a-date' } });
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('not a valid ISO8601'))).toBe(true);
    });

    it('rejects when required fields are missing', () => {
        const doc = { ...validDoc() };
        // @ts-expect-error testing missing field
        delete doc.principal_did;
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('principal_did'))).toBe(true);
    });

    it('rejects a future-dated created_at (potential replay)', () => {
        const doc = validDoc({
            created_at: new Date(Date.now() + 120_000).toISOString(),
        });
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('future'))).toBe(true);
    });

    it('rejects an invalid principal_signature format', () => {
        const doc = validDoc({ principal_signature: 'not-a-valid-sig' });
        const result = validateIntentDocument(doc, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('principal_signature'))).toBe(true);
    });
});

// ── isWithinScope ─────────────────────────────────────────────────────────────

describe('isWithinScope', () => {
    it('allows access when resource matches allowed pattern', () => {
        const doc = validDoc();
        const result = isWithinScope('data.finance.bloomberg', 100, doc);
        expect(result.allowed).toBe(true);
    });

    it('denies access when resource does not match any pattern', () => {
        const doc = validDoc();
        const result = isWithinScope('admin.secrets', 0, doc);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/not covered/);
    });

    it('denies access when amount exceeds max_amount', () => {
        const doc = validDoc();
        const result = isWithinScope('data.finance.bloomberg', 500, doc);
        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/exceeds/i);
    });

    it('allows any resource when allowed_resources is absent', () => {
        const doc = validDoc({
            scope: {
                max_amount: 100,
                expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
        });
        const result = isWithinScope('anything.at.all', 50, doc);
        expect(result.allowed).toBe(true);
    });

    it('handles wildcard ** patterns', () => {
        const doc = validDoc({
            scope: {
                allowed_resources: ['internal/**'],
                expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            },
        });
        expect(isWithinScope('internal/a/b/c', undefined, doc).allowed).toBe(true);
        expect(isWithinScope('external/a', undefined, doc).allowed).toBe(false);
    });
});

// ── validatePoIProof ──────────────────────────────────────────────────────────

describe('validatePoIProof', () => {
    it('validates a correct ProofOfIntent', () => {
        const proof: ProofOfIntent = {
            type: 'proof_of_intent',
            intent_document: validDoc(),
        };
        const result = validatePoIProof(proof, AGENT_DID);
        expect(result.valid).toBe(true);
    });

    it('rejects if type is not proof_of_intent', () => {
        const proof = { type: 'payment', intent_document: validDoc() } as unknown as ProofOfIntent;
        const result = validatePoIProof(proof, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('"proof_of_intent"'))).toBe(true);
    });

    it('rejects if intent_document is missing', () => {
        const proof = { type: 'proof_of_intent' } as unknown as ProofOfIntent;
        const result = validatePoIProof(proof, AGENT_DID);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('intent_document is required'))).toBe(true);
    });
});
