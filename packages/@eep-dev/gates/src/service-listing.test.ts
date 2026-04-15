import { describe, it, expect } from 'vitest';
import { validateServiceListing, validateServiceCatalog, validateReview } from './service-listing.js';

// ── Service Listing Tests ─────────────────────────────────────────────────────

describe('validateServiceListing', () => {
    const VALID_LISTING = {
        id: 'svc_consultation_30',
        name: '30-minute Consultation',
        category: 'consulting',
        pricing: { model: 'fixed', amount: 75, currency: 'usd' },
        delivery: 'realtime',
    };

    it('should validate a valid listing', () => {
        expect(validateServiceListing(VALID_LISTING).valid).toBe(true);
    });

    it('should reject invalid service id', () => {
        expect(validateServiceListing({ ...VALID_LISTING, id: 'bad' }).valid).toBe(false);
    });

    it('should reject missing name', () => {
        expect(validateServiceListing({ ...VALID_LISTING, name: '' }).valid).toBe(false);
    });

    it('should reject missing category', () => {
        expect(validateServiceListing({ ...VALID_LISTING, category: '' }).valid).toBe(false);
    });

    it('should reject missing pricing', () => {
        const { pricing, ...rest } = VALID_LISTING;
        expect(validateServiceListing(rest).valid).toBe(false);
    });

    it('should reject invalid delivery method', () => {
        expect(validateServiceListing({ ...VALID_LISTING, delivery: 'carrier_pigeon' }).valid).toBe(false);
    });

    it('should accept optional tags', () => {
        expect(validateServiceListing({ ...VALID_LISTING, tags: ['ai', 'strategy'] }).valid).toBe(true);
    });

    it('should reject too many tags', () => {
        const tags = Array.from({ length: 21 }, (_, i) => `tag_${i}`);
        expect(validateServiceListing({ ...VALID_LISTING, tags }).valid).toBe(false);
    });

    it('should accept valid status', () => {
        expect(validateServiceListing({ ...VALID_LISTING, status: 'paused' }).valid).toBe(true);
    });

    it('should reject invalid status', () => {
        expect(validateServiceListing({ ...VALID_LISTING, status: 'deleted' }).valid).toBe(false);
    });
});

// ── Service Catalog Tests ─────────────────────────────────────────────────────

describe('validateServiceCatalog', () => {
    it('should validate a valid catalog', () => {
        const r = validateServiceCatalog({
            entity_did: 'did:web:example.com:u:alice',
            services: [{
                id: 'svc_test',
                name: 'Test Service',
                category: 'testing',
                pricing: { model: 'free', currency: 'usd' },
                delivery: 'async',
            }],
        });
        expect(r.valid).toBe(true);
    });

    it('should reject missing entity_did', () => {
        expect(validateServiceCatalog({ services: [] }).valid).toBe(false);
    });

    it('should detect duplicate service IDs', () => {
        const svc = { id: 'svc_dup', name: 'Dup', category: 'test', pricing: { model: 'free', currency: 'usd' }, delivery: 'async' };
        const r = validateServiceCatalog({ entity_did: 'did:web:test', services: [svc, svc] });
        expect(r.valid).toBe(false);
        expect(r.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });
});

// ── Review Tests ──────────────────────────────────────────────────────────────

describe('validateReview', () => {
    it('should validate a valid review', () => {
        expect(validateReview({
            reviewer_did: 'did:web:agent.example.com',
            score: 4,
            service_id: 'svc_test',
        }).valid).toBe(true);
    });

    it('should reject score out of range', () => {
        expect(validateReview({ reviewer_did: 'did:web:x', score: 0, service_id: 'svc_t' }).valid).toBe(false);
        expect(validateReview({ reviewer_did: 'did:web:x', score: 6, service_id: 'svc_t' }).valid).toBe(false);
    });

    it('should reject non-integer score', () => {
        expect(validateReview({ reviewer_did: 'did:web:x', score: 3.5, service_id: 'svc_t' }).valid).toBe(false);
    });

    it('should accept optional comment', () => {
        expect(validateReview({ reviewer_did: 'did:web:x', score: 5, service_id: 'svc_t', comment: 'Great!' }).valid).toBe(true);
    });
});
