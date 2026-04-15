import { describe, it, expect } from 'vitest';
import { transition, getValidActions, isTerminal, validatePricing, validateNegotiationEnvelope } from './commerce.js';

// ── Negotiation State Machine Tests ───────────────────────────────────────────

describe('NegotiationState', () => {
    it('should allow offer → counter', () => {
        const r = transition('open', 'counter');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('countered');
    });

    it('should allow counter → counter (multiple rounds)', () => {
        const r = transition('countered', 'counter');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('countered');
    });

    it('should allow open → accept', () => {
        const r = transition('open', 'accept');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('accepted');
    });

    it('should allow open → reject', () => {
        const r = transition('open', 'reject');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('rejected');
    });

    it('should allow accepted → invoice', () => {
        const r = transition('accepted', 'invoice');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('invoiced');
    });

    it('should allow invoiced → receipt', () => {
        const r = transition('invoiced', 'receipt');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('paid');
    });

    it('should allow paid → complete', () => {
        const r = transition('paid', 'complete');
        expect(r.valid).toBe(true);
        expect(r.to).toBe('completed');
    });

    it('should reject invalid transitions', () => {
        expect(transition('rejected', 'counter').valid).toBe(false);
        expect(transition('completed', 'accept').valid).toBe(false);
        expect(transition('expired', 'counter').valid).toBe(false);
    });

    it('should allow dispute from accepted/invoiced/paid', () => {
        expect(transition('accepted', 'dispute').valid).toBe(true);
        expect(transition('invoiced', 'dispute').valid).toBe(true);
        expect(transition('paid', 'dispute').valid).toBe(true);
    });

    it('should allow resolution of disputes', () => {
        expect(transition('disputed', 'accept').valid).toBe(true);
        expect(transition('disputed', 'reject').valid).toBe(true);
        expect(transition('disputed', 'complete').valid).toBe(true);
    });
});

describe('getValidActions', () => {
    it('should return valid actions for open state', () => {
        const actions = getValidActions('open');
        expect(actions).toContain('counter');
        expect(actions).toContain('accept');
        expect(actions).toContain('reject');
        expect(actions).toContain('expire');
    });

    it('should return empty for terminal states', () => {
        expect(getValidActions('rejected')).toHaveLength(0);
        expect(getValidActions('completed')).toHaveLength(0);
        expect(getValidActions('expired')).toHaveLength(0);
    });
});

describe('isTerminal', () => {
    it('should identify terminal states', () => {
        expect(isTerminal('rejected')).toBe(true);
        expect(isTerminal('completed')).toBe(true);
        expect(isTerminal('expired')).toBe(true);
        expect(isTerminal('open')).toBe(false);
        expect(isTerminal('accepted')).toBe(false);
    });
});

// ── Pricing Validation Tests ──────────────────────────────────────────────────

describe('validatePricing', () => {
    it('should validate a fixed pricing model', () => {
        const r = validatePricing({ model: 'fixed', amount: 50, currency: 'usd' });
        expect(r.valid).toBe(true);
    });

    it('should validate subscription pricing', () => {
        const r = validatePricing({ model: 'subscription', amount: 5, currency: 'eur', period: 'month' });
        expect(r.valid).toBe(true);
    });

    it('should reject subscription without period', () => {
        const r = validatePricing({ model: 'subscription', amount: 5, currency: 'usd' });
        expect(r.valid).toBe(false);
    });

    it('should validate metered pricing', () => {
        const r = validatePricing({ model: 'metered', currency: 'usd', unit: 'token', rate: 0.001 });
        expect(r.valid).toBe(true);
    });

    it('should reject metered without unit', () => {
        const r = validatePricing({ model: 'metered', currency: 'usd', rate: 0.001 });
        expect(r.valid).toBe(false);
    });

    it('should reject negative amounts', () => {
        const r = validatePricing({ model: 'fixed', amount: -10, currency: 'usd' });
        expect(r.valid).toBe(false);
    });

    it('should reject invalid currency', () => {
        const r = validatePricing({ model: 'fixed', amount: 10, currency: 'DOLLARS' });
        expect(r.valid).toBe(false);
    });

    it('should accept custom x- pricing models', () => {
        const r = validatePricing({ model: 'x-crypto-staking', currency: 'eth' });
        expect(r.valid).toBe(true);
    });

    it('should reject min > max charge', () => {
        const r = validatePricing({ model: 'metered', currency: 'usd', unit: 'req', rate: 0.01, minimum_charge: 100, maximum_charge: 10 });
        expect(r.valid).toBe(false);
    });
});

// ── Negotiation Envelope Tests ────────────────────────────────────────────────

describe('validateNegotiationEnvelope', () => {
    it('should validate a valid envelope', () => {
        const r = validateNegotiationEnvelope({
            negotiation_id: 'neg_01abc2def3',
            service: 'consultation.30min',
            pricing: { model: 'fixed', amount: 50, currency: 'usd' },
        });
        expect(r.valid).toBe(true);
    });

    it('should reject invalid negotiation_id', () => {
        const r = validateNegotiationEnvelope({ negotiation_id: 'bad', service: 'test' });
        expect(r.valid).toBe(false);
    });

    it('should reject missing service', () => {
        const r = validateNegotiationEnvelope({ negotiation_id: 'neg_01abc2def3', service: '' });
        expect(r.valid).toBe(false);
    });
});
