import { describe, it, expect } from 'vitest';
import { parseGateConfig } from './gate-config.js';
import { matchResource, matchesAny, findTiersForResource } from './resource-matcher.js';
import { resolveAccess } from './access-resolver.js';
import type { GateConfig, GateProof } from './types.js';

// GitHub-Actions-hosted runners benchmark roughly 3–5× slower than a
// developer laptop and exhibit higher variance from neighbour-noise on
// the shared VM. The thresholds in this file are tuned for a M-series
// Mac; we apply a generous slack factor on CI so a momentarily-loaded
// runner doesn't fail an otherwise-healthy build. The intent of these
// benchmarks is to catch *order-of-magnitude* regressions (e.g.
// accidental O(n²) in resource matching), not to police small constant
// changes — a 4× slack still does that.
const SLOW = process.env.CI ? 4 : 1;

const BENCH_CONFIG: GateConfig = {
    default_tier: 'free',
    tiers: {
        free: { requirements: [], access: ['profile.summary'] },
        ...Object.fromEntries(
            Array.from({ length: 15 }, (_, i) => [`tier_${i}`, {
                requirements: [{ type: 'trust' as const, min_score: (i + 1) * 5 }],
                access: [`section_${i}.*`],
            }])
        ),
    },
};

describe('Benchmarks', () => {
    it('matchResource: 100k matches under 100ms', () => {
        const start = performance.now();
        for (let i = 0; i < 100_000; i++) {
            matchResource('profile.*', 'profile.bio.detail');
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100 * SLOW);
    });

    it('matchesAny: 10k checks against 20 patterns under 50ms', () => {
        const patterns = Array.from({ length: 20 }, (_, i) => `section_${i}.*`);
        const start = performance.now();
        for (let i = 0; i < 10_000; i++) {
            matchesAny(patterns, 'section_15.sub.resource');
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50 * SLOW);
    });

    it('parseGateConfig: 1k parses of complex config under 200ms', () => {
        const raw = JSON.parse(JSON.stringify(BENCH_CONFIG));
        const start = performance.now();
        for (let i = 0; i < 1_000; i++) {
            parseGateConfig(raw);
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(200 * SLOW);
    });

    it('findTiersForResource: 10k lookups in 16-tier config under 100ms', () => {
        const start = performance.now();
        for (let i = 0; i < 10_000; i++) {
            findTiersForResource(BENCH_CONFIG.tiers, 'section_10.sub');
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(100 * SLOW);
    });

    it('resolveAccess: 1k access checks under 200ms', async () => {
        const proofs: GateProof[] = [{ type: 'trust', self_attested: true }];
        const start = performance.now();
        for (let i = 0; i < 1_000; i++) {
            await resolveAccess(proofs, BENCH_CONFIG, 'section_5.data');
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(200 * SLOW);
    });
});
