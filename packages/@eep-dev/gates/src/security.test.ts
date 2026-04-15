import { describe, it, expect } from 'vitest';
import { parseGateConfig } from './gate-config.js';
import { resolveAccess } from './access-resolver.js';
import { validateProofStructure } from './proof-validator.js';
import { matchResource } from './resource-matcher.js';
import type { GateConfig, GateProof } from './types.js';

const GATED_CONFIG: GateConfig = {
    default_tier: 'free',
    tiers: {
        free: { requirements: [], access: ['profile.summary'] },
        paid: {
            requirements: [{ type: 'payment', amount: 10, currency: 'usd', per: 'month' }],
            access: ['*'],
        },
    },
};

describe('Security: Tier Escalation', () => {
    it('should not grant higher tier with wrong proof type', async () => {
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const result = await resolveAccess(proofs, GATED_CONFIG, 'content.secret');
        expect(result.granted).toBe(false);
    });

    it('should not grant access with empty token', async () => {
        const proofs: GateProof[] = [{ type: 'payment', token: '' }];
        const result = await resolveAccess(proofs, GATED_CONFIG, 'content.secret');
        expect(result.granted).toBe(false);
    });

    it('should reject proof with tampered type', () => {
        const result = validateProofStructure({ type: '', token: 'tok_valid' });
        expect(result.valid).toBe(false);
    });
});

describe('Security: Proof Replay', () => {
    it('should reject expired proof', () => {
        const result = validateProofStructure({
            type: 'payment',
            token: 'tok_123',
            expires_at: new Date(Date.now() - 1000).toISOString(),
        });
        expect(result.valid).toBe(false);
    });

    it('should reject future-issued proof (clock manipulation)', () => {
        const result = validateProofStructure({
            type: 'payment',
            token: 'tok_123',
            issued_at: new Date(Date.now() + 3_600_000).toISOString(),
        });
        expect(result.valid).toBe(false);
    });
});

describe('Security: Config Manipulation', () => {
    it('should reject tier key with uppercase or special chars', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                'Admin-Tier': { requirements: [{ type: 'trust', min_score: 50 }], access: ['*'] },
            },
        })).toThrow();
    });

    it('should reject empty tier key', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                '': { requirements: [{ type: 'trust', min_score: 1 }], access: ['*'] },
            },
        })).toThrow();
    });

    it('should reject access patterns with invalid characters', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: { free: { requirements: [], access: ['profile.bio; DROP TABLE users'] } },
        })).toThrow();
    });

    it('should reject nested object injection in requirements', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                bad: { requirements: [{ type: 'trust', min_score: { $gt: 0 } }], access: ['*'] },
            },
        })).toThrow();
    });
});

describe('Security: Allowlist Abuse', () => {
    it('should reject allowlist with more than 1000 DIDs', () => {
        const dids = Array.from({ length: 1001 }, (_, i) => `did:web:agent${i}.example.com`);
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                allow: { requirements: [{ type: 'allowlist', dids }], access: ['*'] },
            },
        })).toThrow('1000');
    });
});

describe('Security: Resource Pattern Injection', () => {
    it('should not match with regex-like patterns', () => {
        // Ensure patterns are NOT treated as regex
        expect(matchResource('.*', 'anything')).toBe(false); // This is NOT a valid wildcard pattern
        expect(matchResource('profile.(bio|skills)', 'profile.bio')).toBe(false);
    });
});

// ── Security: x402 Proof Validation (G2) ─────────────────────────────────────

describe('Security: x402 Payment Proof Validation', () => {
    it('should accept a valid token-based payment proof', () => {
        const result = validateProofStructure({ type: 'payment', token: 'tok_stripe_valid' });
        expect(result.valid).toBe(true);
    });

    it('should accept a valid x402_payload proof', () => {
        const result = validateProofStructure({
            type: 'payment',
            x402_payload: {
                payload: '{"from":"0xabc","to":"0xdef","value":100}',
                signature: '0x' + 'a'.repeat(130),
                network: 'base',
            },
        });
        expect(result.valid).toBe(true);
    });

    it('should reject a payment proof with neither token nor x402_payload', () => {
        const result = validateProofStructure({ type: 'payment' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('token') && e.includes('x402_payload'))).toBe(true);
    });

    it('should reject x402_payload with a malformed signature', () => {
        const result = validateProofStructure({
            type: 'payment',
            x402_payload: {
                payload: '{"from":"0xabc"}',
                signature: 'not-a-hex-sig',
                network: 'base',
            },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('signature'))).toBe(true);
    });

    it('should reject x402_payload with empty network', () => {
        const result = validateProofStructure({
            type: 'payment',
            x402_payload: {
                payload: '{"from":"0xabc"}',
                signature: '0x' + 'a'.repeat(130),
                network: '',
            },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('network'))).toBe(true);
    });

    it('should reject x402_payload with empty payload string', () => {
        const result = validateProofStructure({
            type: 'payment',
            x402_payload: {
                payload: '',
                signature: '0x' + 'a'.repeat(130),
                network: 'base',
            },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('payload'))).toBe(true);
    });
});

// ── Security: Proof-of-Intent Structural Validation (G4) ─────────────────────

describe('Security: Proof-of-Intent in proof-validator', () => {
    it('should accept a structurally valid PoI proof', () => {
        const result = validateProofStructure({
            type: 'proof_of_intent',
            intent_document: {
                intent_id: 'intent_01HXK',
                agent_did: 'did:web:agent.example.com',
                principal_did: 'did:web:human.example.com',
                action: 'Fetch Bloomberg data',
                scope: {
                    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
                    max_amount: 100,
                    currency: 'USDC',
                },
                principal_signature: '0x' + 'b'.repeat(130),
                created_at: new Date().toISOString(),
            },
        });
        expect(result.valid).toBe(true);
    });

    it('should reject a PoI proof with missing intent_document', () => {
        const result = validateProofStructure({ type: 'proof_of_intent' });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('intent_document'))).toBe(true);
    });

    it('should reject a PoI proof with expired scope', () => {
        const result = validateProofStructure({
            type: 'proof_of_intent',
            intent_document: {
                intent_id: 'i1', agent_did: 'did:web:a', principal_did: 'did:web:p',
                action: 'do it', principal_signature: '0x' + 'f'.repeat(130),
                created_at: new Date().toISOString(),
                scope: { expires_at: new Date(Date.now() - 1000).toISOString() },
            },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.toLowerCase().includes('expir'))).toBe(true);
    });
});

