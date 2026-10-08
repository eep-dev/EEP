import { describe, expect, it } from 'vitest';
import {
    build402Response,
    build429Response,
    parseGateConfig,
    PROBLEM_TYPE_PAYMENT_REQUIRED,
    PROBLEM_TYPE_RATE_LIMITED,
    PROBLEM_JSON_CONTENT_TYPE,
} from './index.js';

// SPECIFICATION.md §3.3.1 — EEP error responses are RFC 9457 problem details.
// The EEP-specific fields remain as problem *extension members*, so this is
// additive: a client reading the old fields keeps working.
describe('RFC 9457 problem details (§3.3.1)', () => {
    const config = parseGateConfig({
        default_tier: 'public',
        tiers: {
            public: { requirements: [], access: ['entity.public.profile'] },
            premium: {
                requirements: [{ type: 'payment', amount: 1, currency: 'usd', per: 'request' }],
                access: ['content.papers.full_text'],
            },
        },
    });

    describe('402', () => {
        it('carries type, title and status', async () => {
            const body = await build402Response(config, 'content.papers.full_text', []);
            expect(body.type).toBe(PROBLEM_TYPE_PAYMENT_REQUIRED);
            expect(body.title).toBe('Payment Required');
            expect(body.status).toBe(402);
        });

        it('carries an occurrence-specific detail', async () => {
            const body = await build402Response(config, 'content.papers.full_text', []);
            expect(typeof body.detail).toBe('string');
            expect(body.detail).toContain('content.papers.full_text');
        });

        // The point of RFC 9457 extension members: nothing EEP already
        // defined is removed or renamed.
        it('preserves every pre-existing EEP field', async () => {
            const body = await build402Response(config, 'content.papers.full_text', []);
            expect(body.error).toBe('access_restricted');
            expect(body.resource).toBe('content.papers.full_text');
            expect(body.current_tier).toBe('public');
            expect(body.required_tier).toBe('premium');
            expect(Array.isArray(body.unmet_requirements)).toBe(true);
        });

        // `title` identifies the problem TYPE, so it must not vary between
        // occurrences; `detail` is where per-occurrence information goes.
        it('keeps title stable across different resources', async () => {
            const a = await build402Response(config, 'content.papers.full_text', []);
            const b = await build402Response(config, 'entity.public.profile', []);
            expect(a.title).toBe(b.title);
            expect(a.type).toBe(b.type);
        });
    });

    describe('429', () => {
        const sign = async (challenge: string) => `sig(${challenge.slice(0, 8)})`;

        it('carries type, title and status', async () => {
            const { body } = await build429Response('did:key:agent', 60, sign);
            expect(body.type).toBe(PROBLEM_TYPE_RATE_LIMITED);
            expect(body.title).toBe('Too Many Requests');
            expect(body.status).toBe(429);
        });

        it('serves the RFC 9457 media type', async () => {
            const { headers } = await build429Response('did:key:agent', 60, sign);
            expect(headers['Content-Type']).toBe(PROBLEM_JSON_CONTENT_TYPE);
        });

        it('preserves the pre-existing rate-limit fields', async () => {
            const { body, headers } = await build429Response('did:key:agent', 60, sign, {
                limitPerWindow: 100,
                requestsMade: 101,
            });
            expect(body.error).toBe('rate_limited');
            expect(body.did_rate_limit_key).toBe('did:key:agent');
            expect(body.retry_after_seconds).toBe(60);
            expect(body.signed_challenge).toContain('v1.');
            expect(body.limit_per_window).toBe(100);
            expect(headers['Retry-After']).toBe('60');
        });
    });

    // SPECIFICATION.md §13 — the standards-track RateLimit fields are
    // required; X-RateLimit-* is a compatibility SHOULD. Both must describe
    // the same quota.
    describe('429 rate-limit headers (§13)', () => {
        const sign = async (challenge: string) => `sig(${challenge.slice(0, 8)})`;

        it('emits the standards-track RateLimit field', async () => {
            const { headers } = await build429Response('did:key:agent', 60, sign);
            // On a 429 the remaining quota is zero by definition.
            expect(headers['RateLimit']).toBe('"eep"; r=0; t=60');
        });

        it('emits RateLimit-Policy when a quota is known', async () => {
            const { headers } = await build429Response('did:key:agent', 60, sign, {
                limitPerWindow: 100,
            });
            expect(headers['RateLimit-Policy']).toBe('"eep"; q=100; w=60');
        });

        it('keeps the de-facto headers consistent with the standards-track ones', async () => {
            const { headers } = await build429Response('did:key:agent', 60, sign, {
                limitPerWindow: 100,
            });
            expect(headers['X-RateLimit-Limit']).toBe('100');
            expect(headers['X-RateLimit-Remaining']).toBe('0');
            expect(headers['RateLimit-Policy']).toContain('q=100');
            expect(headers['RateLimit']).toContain('r=0');
        });

        it('omits the quota headers when no quota was supplied', async () => {
            const { headers } = await build429Response('did:key:agent', 60, sign);
            expect(headers['RateLimit-Policy']).toBeUndefined();
            expect(headers['X-RateLimit-Limit']).toBeUndefined();
            // The current-state field is still reported.
            expect(headers['RateLimit']).toBeDefined();
        });

        it('always accompanies a 429 with Retry-After', async () => {
            const { headers } = await build429Response('did:key:agent', 90, sign);
            expect(headers['Retry-After']).toBe('90');
        });
    });

    it('uses distinct problem type URIs per condition', () => {
        expect(PROBLEM_TYPE_PAYMENT_REQUIRED).not.toBe(PROBLEM_TYPE_RATE_LIMITED);
        for (const uri of [PROBLEM_TYPE_PAYMENT_REQUIRED, PROBLEM_TYPE_RATE_LIMITED]) {
            expect(() => new URL(uri)).not.toThrow();
        }
    });
});
