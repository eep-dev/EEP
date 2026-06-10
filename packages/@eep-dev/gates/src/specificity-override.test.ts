import { describe, it, expect } from 'vitest';
import { resolveAccess, defaultTierOverriddenByGatedTier } from './access-resolver.js';
import { patternSpecificity, bestSpecificityFor } from './resource-matcher.js';
import { ProofVerifierRegistry } from './proof-validator.js';
import type { GateConfig, GateProof } from './types.js';

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// The bypass: a default (no-requirements) tier publishes a broad wildcard
// (`content.*`) that *covers* a resource which a gated tier targets with a
// strictly-more-specific pattern (`content.premium.*`). Before the fix the
// resolver granted access via the default tier's broad match even when the
// gated tier's requirements were unmet, silently bypassing the gate.

const BYPASS_CONFIG: GateConfig = {
    default_tier: 'public',
    tiers: {
        public: {
            requirements: [],
            access: ['content.*', 'profile.*'],
        },
        paid: {
            label: 'Premium',
            requirements: [{ type: 'trust', min_score: 20 }],
            access: ['content.premium.*'],
        },
    },
};

const EQUAL_SPECIFICITY_CONFIG: GateConfig = {
    default_tier: 'public',
    tiers: {
        // Default lists the *same* pattern as the gated tier — public must not
        // win the tie and bypass the gated tier's requirements.
        public: { requirements: [], access: ['content.premium.*'] },
        paid: {
            requirements: [{ type: 'trust', min_score: 20 }],
            access: ['content.premium.*'],
        },
    },
};

function allowRegistry(types: string[] = ['trust', 'payment', 'identity', 'credential', 'connection']): ProofVerifierRegistry {
    const registry = new ProofVerifierRegistry();
    for (const type of types) {
        registry.register({ supportedTypes: [type], verify: async () => true });
    }
    return registry;
}

// ── resolveAccess: default-tier specificity override ──────────────────────────

describe('resolveAccess — default-tier wildcard specificity override', () => {
    it('denies a gated resource that the default tier covers via a broader wildcard (the bypass)', async () => {
        const result = await resolveAccess([], BYPASS_CONFIG, 'content.premium.eep-whitepaper');
        expect(result.granted).toBe(false);
        expect(result.tier).toBe('public');
        expect(result.unmet.some((u) => u.type === 'trust')).toBe(true);
    });

    it('still grants the gated resource once the gated tier requirements are met', async () => {
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const result = await resolveAccess(proofs, BYPASS_CONFIG, 'content.premium.eep-whitepaper', allowRegistry());
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('paid');
    });

    it('keeps non-premium content public (the default wildcard is authoritative there)', async () => {
        const result = await resolveAccess([], BYPASS_CONFIG, 'content.blog.hello-world');
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('public');
    });

    it('still grants resources the default tier covers and no gated tier touches', async () => {
        const result = await resolveAccess([], BYPASS_CONFIG, 'profile.bio');
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('public');
    });

    it('denies on an equal-specificity tie between the default and a gated tier', async () => {
        const result = await resolveAccess([], EQUAL_SPECIFICITY_CONFIG, 'content.premium.x');
        expect(result.granted).toBe(false);
        expect(result.tier).toBe('public');
    });

    it('grants the equal-specificity resource once requirements are met', async () => {
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const result = await resolveAccess(proofs, EQUAL_SPECIFICITY_CONFIG, 'content.premium.x', allowRegistry());
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('paid');
    });

    it('does not change resource-less resolution (no override when no resource is given)', async () => {
        const result = await resolveAccess([], BYPASS_CONFIG);
        expect(result.granted).toBe(true);
        expect(result.tier).toBe('public');
    });
});

// ── patternSpecificity ────────────────────────────────────────────────────────

describe('patternSpecificity', () => {
    it('ranks the universal wildcard as least specific', () => {
        expect(patternSpecificity('*')).toBe(0);
    });

    it('ranks scope wildcards by length', () => {
        expect(patternSpecificity('content.*')).toBe('content.*'.length);
        expect(patternSpecificity('content.premium.*')).toBe('content.premium.*'.length);
        expect(patternSpecificity('content.premium.*')).toBeGreaterThan(patternSpecificity('content.*'));
    });

    it('ranks exact patterns above any wildcard', () => {
        expect(patternSpecificity('content.premium.x')).toBe('content.premium.x'.length + 1000);
        expect(patternSpecificity('a')).toBeGreaterThan(patternSpecificity('verylongprefix.*'));
    });
});

// ── bestSpecificityFor ────────────────────────────────────────────────────────

describe('bestSpecificityFor', () => {
    it('returns the specificity of the best matching pattern', () => {
        expect(bestSpecificityFor(['content.*', 'profile.*'], 'content.premium.x')).toBe('content.*'.length);
    });

    it('prefers the more specific of several matching patterns', () => {
        expect(bestSpecificityFor(['content.*', 'content.premium.*'], 'content.premium.x')).toBe('content.premium.*'.length);
    });

    it('keeps the higher score when a later matching pattern is less specific', () => {
        // First match is most specific; a later, broader match must not lower it.
        expect(bestSpecificityFor(['content.premium.*', 'content.*'], 'content.premium.x')).toBe('content.premium.*'.length);
    });

    it('returns -1 when no pattern matches', () => {
        expect(bestSpecificityFor(['profile.*', 'video.*'], 'content.premium.x')).toBe(-1);
    });

    it('returns -1 for an empty pattern list', () => {
        expect(bestSpecificityFor([], 'content.premium.x')).toBe(-1);
    });
});

// ── defaultTierOverriddenByGatedTier ──────────────────────────────────────────

describe('defaultTierOverriddenByGatedTier', () => {
    it('is true when a gated tier targets the resource more specifically than the default', () => {
        expect(defaultTierOverriddenByGatedTier(BYPASS_CONFIG, 'content.premium.x')).toBe(true);
    });

    it('is true on an equal-specificity tie with a gated tier', () => {
        expect(defaultTierOverriddenByGatedTier(EQUAL_SPECIFICITY_CONFIG, 'content.premium.x')).toBe(true);
    });

    it('is false when no gated tier covers the resource', () => {
        expect(defaultTierOverriddenByGatedTier(BYPASS_CONFIG, 'content.blog.post')).toBe(false);
    });

    it('fails closed when the configured default tier is missing from tiers', () => {
        const config = {
            default_tier: 'ghost',
            tiers: {
                paid: { requirements: [{ type: 'trust', min_score: 20 }], access: ['content.premium.*'] },
            },
        } as unknown as GateConfig;
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.x')).toBe(true);
    });

    it('fails closed when the default tier does not cover the resource at all', () => {
        const config: GateConfig = {
            default_tier: 'public',
            tiers: {
                public: { requirements: [], access: ['profile.*'] },
                paid: { requirements: [{ type: 'trust', min_score: 20 }], access: ['content.premium.*'] },
            },
        };
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.x')).toBe(true);
    });

    it('ignores non-default tiers that have no requirements (free tiers do not gate)', () => {
        const config: GateConfig = {
            default_tier: 'public',
            tiers: {
                public: { requirements: [], access: ['content.*'] },
                open: { requirements: [], access: ['content.premium.*'] },
            },
        };
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.x')).toBe(false);
    });

    it('ignores non-default tiers whose requirements field is absent', () => {
        const config = {
            default_tier: 'public',
            tiers: {
                public: { requirements: [], access: ['content.*'] },
                weird: { access: ['content.premium.*'] },
            },
        } as unknown as GateConfig;
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.x')).toBe(false);
    });

    it('ignores gated tiers that do not cover the resource', () => {
        const config: GateConfig = {
            default_tier: 'public',
            tiers: {
                public: { requirements: [], access: ['content.*'] },
                paid: { requirements: [{ type: 'trust', min_score: 20 }], access: ['video.*'] },
            },
        };
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.x')).toBe(false);
    });

    it('is false when the default tier is itself more specific than the gated tier', () => {
        const config: GateConfig = {
            default_tier: 'public',
            tiers: {
                public: { requirements: [], access: ['content.premium.docs.*'] },
                paid: { requirements: [{ type: 'trust', min_score: 20 }], access: ['content.*'] },
            },
        };
        expect(defaultTierOverriddenByGatedTier(config, 'content.premium.docs.readme')).toBe(false);
    });
});
