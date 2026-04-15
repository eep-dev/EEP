/**
 * @eep-dev/gates — Commerce (Negotiation State Machine + Pricing)
 *
 * State machine for commerce negotiations and pricing model validation.
 */

import type { NegotiationStatus, CommerceAction, Pricing, NegotiationEnvelope } from './types.js';

// ── Negotiation State Machine ─────────────────────────────────────────────────

/** Valid state transitions for commerce negotiations */
const VALID_TRANSITIONS: Record<NegotiationStatus, CommerceAction[]> = {
    open: ['counter', 'accept', 'reject', 'expire'],
    countered: ['counter', 'accept', 'reject', 'expire'],
    accepted: ['invoice', 'complete', 'dispute'],
    rejected: [],
    expired: [],
    invoiced: ['receipt', 'dispute'],
    paid: ['complete', 'dispute'],
    completed: [],
    disputed: ['accept', 'reject', 'complete'],
};

/** What status does each action produce */
const ACTION_RESULTS: Record<CommerceAction, NegotiationStatus> = {
    offer: 'open',
    counter: 'countered',
    accept: 'accepted',
    reject: 'rejected',
    expire: 'expired',
    invoice: 'invoiced',
    receipt: 'paid',
    complete: 'completed',
    dispute: 'disputed',
};

export interface TransitionResult {
    valid: boolean;
    from: NegotiationStatus;
    to: NegotiationStatus;
    action: CommerceAction;
    error?: string;
}

/**
 * Attempt a state transition on a negotiation.
 */
export function transition(current: NegotiationStatus, action: CommerceAction): TransitionResult {
    const allowed = VALID_TRANSITIONS[current];

    if (!allowed) {
        return {
            valid: false,
            from: current,
            to: current,
            action,
            error: `Unknown state "${current}"`,
        };
    }

    if (!allowed.includes(action)) {
        return {
            valid: false,
            from: current,
            to: current,
            action,
            error: `Cannot "${action}" from state "${current}". Valid actions: ${allowed.join(', ') || 'none'}`,
        };
    }

    return {
        valid: true,
        from: current,
        to: ACTION_RESULTS[action],
        action,
    };
}

/**
 * Get valid actions for a given state.
 */
export function getValidActions(status: NegotiationStatus): CommerceAction[] {
    return VALID_TRANSITIONS[status] || [];
}

/**
 * Check if a negotiation is in a terminal state.
 */
export function isTerminal(status: NegotiationStatus): boolean {
    const actions = VALID_TRANSITIONS[status];
    return !actions || actions.length === 0;
}

// ── Pricing Validation ────────────────────────────────────────────────────────

const STANDARD_MODELS = new Set([
    'fixed', 'per_request', 'per_event', 'subscription', 'metered', 'tiered_volume', 'free',
]);

const CURRENCY_PATTERN = /^[a-z]{3}$/;

export interface PricingValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validate a pricing object.
 */
export function validatePricing(pricing: unknown): PricingValidationResult {
    const errors: string[] = [];

    if (typeof pricing !== 'object' || pricing === null) {
        return { valid: false, errors: ['Pricing must be an object'] };
    }

    const p = pricing as Record<string, unknown>;

    if (typeof p.model !== 'string') {
        errors.push('Pricing model is required');
    } else if (!STANDARD_MODELS.has(p.model) && !p.model.startsWith('x-')) {
        errors.push(`Unknown pricing model "${p.model}". Use standard models or x- prefix.`);
    }

    if (typeof p.currency !== 'string' || !CURRENCY_PATTERN.test(p.currency)) {
        errors.push('Currency must be a 3-letter lowercase ISO 4217 code');
    }

    if (p.amount !== undefined && (typeof p.amount !== 'number' || p.amount < 0)) {
        errors.push('Amount must be a non-negative number');
    }

    // Model-specific validation
    if (p.model === 'subscription' && !p.period) {
        errors.push('Subscription model requires a "period" field');
    }

    if (p.model === 'metered') {
        if (!p.unit) errors.push('Metered model requires a "unit" field');
        if (typeof p.rate !== 'number' || p.rate < 0) errors.push('Metered model requires a non-negative "rate"');
    }

    if (p.model === 'tiered_volume') {
        if (!Array.isArray(p.tiers) || p.tiers.length === 0) {
            errors.push('Tiered volume model requires a non-empty "tiers" array');
        }
    }

    if (p.minimum_charge !== undefined && p.maximum_charge !== undefined) {
        if (typeof p.minimum_charge === 'number' && typeof p.maximum_charge === 'number') {
            if (p.minimum_charge > p.maximum_charge) {
                errors.push('minimum_charge cannot exceed maximum_charge');
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a commerce negotiation envelope.
 */
export function validateNegotiationEnvelope(data: unknown): PricingValidationResult {
    const errors: string[] = [];

    if (typeof data !== 'object' || data === null) {
        return { valid: false, errors: ['Negotiation data must be an object'] };
    }

    const d = data as Record<string, unknown>;

    if (typeof d.negotiation_id !== 'string' || !/^neg_[a-zA-Z0-9]{8,32}$/.test(d.negotiation_id)) {
        errors.push('negotiation_id must match pattern neg_[a-zA-Z0-9]{8,32}');
    }

    if (typeof d.service !== 'string' || d.service.length === 0) {
        errors.push('service is required');
    }

    if (d.pricing) {
        const pricingResult = validatePricing(d.pricing);
        errors.push(...pricingResult.errors);
    }

    if (d.terms) {
        if (typeof d.terms !== 'object') {
            errors.push('terms must be an object');
        }
    }

    return { valid: errors.length === 0, errors };
}
