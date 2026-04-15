import { describe, it, expect } from 'vitest';
import { parseGateConfig, GateConfigError, getUsedRequirementTypes } from './gate-config.js';
import { matchResource, matchesAny, findTiersForResource } from './resource-matcher.js';
import { resolveAccess } from './access-resolver.js';
import { validateProofStructure, validateProofs, ProofVerifierRegistry } from './proof-validator.js';
import { build402Response, isGatedResource } from './http-402.js';
import type { GateConfig, GateProof } from './types.js';

// ── Test Fixtures ─────────────────────────────────────────────────────────────

const VALID_CONFIG: GateConfig = {
    default_tier: 'public',
    tiers: {
        public: {
            requirements: [],
            access: ['profile.summary', 'profile.capabilities', 'events.public'],
        },
        verified: {
            label: 'Verified Agents',
            requirements: [{ type: 'trust', min_score: 50 }],
            access: ['profile.*', 'events.public'],
        },
        academic: {
            label: 'Academic Access',
            requirements: [
                { type: 'credential', credential_type: 'AcademicAffiliation' },
            ],
            access: ['profile.*', 'content.papers.*'],
        },
        premium: {
            label: 'Premium',
            requirements: [
                { type: 'payment', amount: 5, currency: 'usd', per: 'month' },
            ],
            access: ['*'],
        },
    },
};

// ── Gate Config Tests ─────────────────────────────────────────────────────────

describe('parseGateConfig', () => {
    it('should parse a valid config', () => {
        const config = parseGateConfig(VALID_CONFIG);
        expect(config.default_tier).toBe('public');
        expect(Object.keys(config.tiers)).toHaveLength(4);
    });

    it('should reject non-object input', () => {
        expect(() => parseGateConfig(null)).toThrow(GateConfigError);
        expect(() => parseGateConfig('string')).toThrow(GateConfigError);
    });

    it('should reject missing default_tier', () => {
        expect(() => parseGateConfig({ tiers: { free: { requirements: [], access: ['*'] } } })).toThrow('default_tier');
    });

    it('should reject default_tier not in tiers', () => {
        expect(() => parseGateConfig({
            default_tier: 'missing',
            tiers: { free: { requirements: [], access: ['*'] } },
        })).toThrow('must exist in tiers');
    });

    it('should reject default_tier with requirements', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [{ type: 'trust', min_score: 10 }], access: ['*'] },
            },
        })).toThrow('zero requirements');
    });

    it('should reject invalid tier keys', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                'UPPER-CASE': { requirements: [], access: ['*'] },
            },
        })).toThrow('Invalid tier key');
    });

    it('should reject empty tiers', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {},
        })).toThrow('At least one tier');
    });

    it('should reject too many tiers (>20)', () => {
        const tiers: Record<string, unknown> = { free: { requirements: [], access: ['*'] } };
        for (let i = 0; i < 21; i++) tiers[`tier_${i}`] = { requirements: [{ type: 'trust', min_score: i }], access: ['*'] };
        expect(() => parseGateConfig({ default_tier: 'free', tiers })).toThrow('Maximum');
    });

    it('should reject invalid access patterns', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: { free: { requirements: [], access: ['INVALID PATTERN!'] } },
        })).toThrow('Invalid access pattern');
    });

    it('should reject tiers without access array', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: { free: { requirements: [] } },
        })).toThrow('access');
    });

    it('should accept all 8 standard requirement types', () => {
        const config = parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                full: {
                    requirements: [
                        { type: 'payment', amount: 1, currency: 'usd', per: 'once' },
                        { type: 'trust', min_score: 50 },
                        { type: 'identity', method: 'did_verified' },
                        { type: 'connection', relation: 'mutual' },
                        { type: 'credential', credential_type: 'License' },
                        { type: 'capability', required_capabilities: ['purchasable'] },
                        { type: 'allowlist', dids: ['did:web:example.com'] },
                        { type: 'reciprocal', access_level: 'profile.*' },
                    ],
                    access: ['*'],
                },
            },
        });
        expect(config.tiers.full.requirements).toHaveLength(8);
    });

    it('should accept custom x- requirement types', () => {
        const config = parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                dao: { requirements: [{ type: 'x-dao-membership', dao_address: '0x123' }], access: ['*'] },
            },
        });
        expect(config.tiers.dao.requirements[0].type).toBe('x-dao-membership');
    });

    it('should reject unknown requirement types (not standard, not x-)', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                bad: { requirements: [{ type: 'magic' }], access: ['*'] },
            },
        })).toThrow('Unknown requirement type');
    });

    it('should validate payment requirement fields', () => {
        expect(() => parseGateConfig({
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['*'] },
                paid: { requirements: [{ type: 'payment', amount: -1, currency: 'usd', per: 'month' }], access: ['*'] },
            },
        })).toThrow('positive number');
    });

    it('should set fallback_behavior default to restrict', () => {
        const config = parseGateConfig(VALID_CONFIG);
        expect(config.fallback_behavior).toBe('restrict');
    });
});

describe('getUsedRequirementTypes', () => {
    it('should list all requirement types used', () => {
        const config = parseGateConfig(VALID_CONFIG);
        const types = getUsedRequirementTypes(config);
        expect(types).toContain('trust');
        expect(types).toContain('credential');
        expect(types).toContain('payment');
        expect(types.size).toBe(3);
    });
});

// ── Resource Matcher Tests ────────────────────────────────────────────────────

describe('matchResource', () => {
    it('should match universal wildcard', () => {
        expect(matchResource('*', 'anything.at.all')).toBe(true);
    });

    it('should match exact strings', () => {
        expect(matchResource('profile.bio', 'profile.bio')).toBe(true);
        expect(matchResource('profile.bio', 'profile.skills')).toBe(false);
    });

    it('should match wildcard suffix', () => {
        expect(matchResource('profile.*', 'profile.bio')).toBe(true);
        expect(matchResource('profile.*', 'profile.skills')).toBe(true);
        expect(matchResource('profile.*', 'profile.contact.email')).toBe(true);
        expect(matchResource('profile.*', 'events.public')).toBe(false);
    });

    it('should match the prefix itself when using wildcard', () => {
        expect(matchResource('profile.*', 'profile')).toBe(true);
    });

    it('should not match partial prefixes', () => {
        expect(matchResource('pro.*', 'profile.bio')).toBe(false);
    });
});

describe('matchesAny', () => {
    it('should return true if any pattern matches', () => {
        expect(matchesAny(['profile.summary', 'events.*'], 'events.public')).toBe(true);
    });

    it('should return false if no patterns match', () => {
        expect(matchesAny(['profile.summary'], 'content.papers')).toBe(false);
    });
});

describe('findTiersForResource', () => {
    it('should find tiers that grant access', () => {
        const result = findTiersForResource(VALID_CONFIG.tiers, 'content.papers.full_text');
        expect(result).toContain('academic');
        expect(result).toContain('premium');
        expect(result).not.toContain('public');
    });
});

// ── Proof Validation Tests ────────────────────────────────────────────────────

describe('validateProofStructure', () => {
    it('should validate a valid payment proof', () => {
        const result = validateProofStructure({ type: 'payment', token: 'tok_123' });
        expect(result.valid).toBe(true);
    });

    it('should reject proof without type', () => {
        const result = validateProofStructure({ token: 'tok_123' });
        expect(result.valid).toBe(false);
    });

    it('should reject expired proof', () => {
        const result = validateProofStructure({
            type: 'payment',
            token: 'tok_123',
            expires_at: '2020-01-01T00:00:00Z',
        });
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('expired');
    });

    it('should reject proof issued in the future', () => {
        const futureDate = new Date(Date.now() + 3600_000).toISOString();
        const result = validateProofStructure({
            type: 'payment',
            token: 'tok_123',
            issued_at: futureDate,
        });
        expect(result.valid).toBe(false);
    });

    it('should validate trust proof', () => {
        expect(validateProofStructure({ type: 'trust', self_attested: true }).valid).toBe(true);
        expect(validateProofStructure({ type: 'trust', self_attested: false }).valid).toBe(false);
    });

    it('should validate credential proof', () => {
        expect(validateProofStructure({ type: 'credential', credential: 'eyJ...', format: 'jwt_vc' }).valid).toBe(true);
        expect(validateProofStructure({ type: 'credential' }).valid).toBe(false);
    });

    it('should accept custom x- proof types', () => {
        expect(validateProofStructure({ type: 'x-dao-token', token_id: '123' }).valid).toBe(true);
    });

    it('should reject unknown (non x-) proof types', () => {
        expect(validateProofStructure({ type: 'magic' }).valid).toBe(false);
    });
});

describe('validateProofs', () => {
    it('should validate array of proofs', () => {
        const result = validateProofs([
            { type: 'payment', token: 'tok_1' },
            { type: 'trust', self_attested: true },
        ]);
        expect(result.valid).toBe(true);
    });

    it('should reject more than 10 proofs', () => {
        const proofs = Array.from({ length: 11 }, (_, i) => ({ type: 'payment', token: `tok_${i}` }));
        expect(validateProofs(proofs).valid).toBe(false);
    });
});

// ── Access Resolver Tests ─────────────────────────────────────────────────────

describe('resolveAccess', () => {
    function createAllowRegistry(): ProofVerifierRegistry {
        const registry = new ProofVerifierRegistry();
        for (const type of ['trust', 'payment', 'identity', 'connection', 'credential']) {
            registry.register({
                supportedTypes: [type],
                verify: async () => true,
            });
        }
        return registry;
    }

    it('should grant default tier with no proofs', async () => {
        const result = await resolveAccess([], VALID_CONFIG);
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('public');
    });

    it('should grant higher tier with matching proof', async () => {
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const result = await resolveAccess(proofs, VALID_CONFIG, undefined, createAllowRegistry());
        expect(result.tier).toBe('verified');
    });

    it('should grant premium with payment proof', async () => {
        const proofs: GateProof[] = [{ type: 'payment', token: 'tok_valid' }];
        const result = await resolveAccess(proofs, VALID_CONFIG, undefined, createAllowRegistry());
        expect(result.tier).toBe('premium');
    });

    it('should deny gated resource without proof', async () => {
        const result = await resolveAccess([], VALID_CONFIG, 'content.papers.full_text');
        expect(result.granted).toBe(false);
        expect(result.unmet.length).toBeGreaterThan(0);
    });

    it('should grant gated resource with matching proof', async () => {
        const proofs: GateProof[] = [{ type: 'payment', token: 'tok_valid' }];
        const result = await resolveAccess(proofs, VALID_CONFIG, 'content.papers.full_text', createAllowRegistry());
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('premium');
    });

    it('should return unmet requirements with resolution hints', async () => {
        const result = await resolveAccess([], VALID_CONFIG, 'content.papers.full_text');
        expect(result.unmet[0]).toHaveProperty('resolution_hint');
    });

    it('should handle multi-requirement tiers', async () => {
        const config: GateConfig = {
            default_tier: 'free',
            tiers: {
                free: { requirements: [], access: ['profile.summary'] },
                vip: {
                    requirements: [
                        { type: 'trust', min_score: 70 },
                        { type: 'connection', relation: 'mutual' },
                    ],
                    access: ['*'],
                },
            },
        };
        // Only one proof — should NOT grant vip (AND logic)
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const result = await resolveAccess(proofs, config, undefined, createAllowRegistry());
        expect(result.tier).toBe('free');
    });

    it('should fail-closed when semantic verifier is missing (default)', async () => {
        const proofs: GateProof[] = [{ type: 'payment', token: 'tok_valid' }];
        const result = await resolveAccess(proofs, VALID_CONFIG, 'content.papers.full_text');
        expect(result.granted).toBe(false);
        expect(result.tier).toBe('public');
    });

    it('should support explicit structural fallback when strict mode disabled', async () => {
        const proofs: GateProof[] = [{ type: 'payment', token: 'tok_valid' }];
        const result = await resolveAccess(proofs, VALID_CONFIG, 'content.papers.full_text', undefined, {
            strictSemanticVerification: false,
        });
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('premium');
    });
});

// ── HTTP 402 Tests ────────────────────────────────────────────────────────────

describe('build402Response', () => {
    it('should build a valid 402 response', async () => {
        const response = await build402Response(VALID_CONFIG, 'content.papers.full_text', []);
        expect(response.error).toBe('access_restricted');
        expect(response.resource).toBe('content.papers.full_text');
        expect(response.current_tier).toBe('public');
        expect(response.unmet_requirements.length).toBeGreaterThan(0);
    });

    it('should include available tiers', async () => {
        const response = await build402Response(VALID_CONFIG, 'content.papers.full_text', []);
        expect(response.available_tiers).toBeDefined();
    });

    it('should include gates_config_url when provided', async () => {
        const response = await build402Response(VALID_CONFIG, 'content.papers.full_text', [], 'https://api.example.com/gates/alice');
        expect(response.gates_config_url).toBe('https://api.example.com/gates/alice');
    });
});

describe('isGatedResource', () => {
    it('should return false for public resources', () => {
        expect(isGatedResource(VALID_CONFIG, 'profile.summary')).toBe(false);
    });

    it('should return true for gated resources', () => {
        expect(isGatedResource(VALID_CONFIG, 'content.papers.full_text')).toBe(true);
    });
});

// ── ProofVerifierRegistry Tests ───────────────────────────────────────────────

describe('ProofVerifierRegistry', () => {
    it('should register and retrieve verifiers', () => {
        const registry = new ProofVerifierRegistry();
        registry.register({
            supportedTypes: ['trust'],
            verify: async () => true,
        });
        expect(registry.hasVerifier('trust')).toBe(true);
        expect(registry.hasVerifier('payment')).toBe(false);
    });

    it('should verify proofs via registered verifier', async () => {
        const registry = new ProofVerifierRegistry();
        registry.register({
            supportedTypes: ['trust'],
            verify: async (proof, req) => {
                return req.type === 'trust';
            },
        });
        const result = await registry.verify(
            { type: 'trust', self_attested: true },
            { type: 'trust', min_score: 50 },
        );
        expect(result).toBe(true);
    });
});
