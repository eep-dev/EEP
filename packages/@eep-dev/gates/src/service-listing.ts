/**
 * @eep-dev/gates — Service Listing Validation
 *
 * Validate service catalogs and reviews.
 */

import type { ServiceListing, ServiceCatalog, Review } from './types.js';
import { validatePricing } from './commerce.js';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const SERVICE_ID_PATTERN = /^svc_[a-zA-Z0-9_]{1,64}$/;

/**
 * Validate a single service listing.
 */
export function validateServiceListing(listing: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof listing !== 'object' || listing === null) {
        return { valid: false, errors: ['Service listing must be an object'] };
    }

    const s = listing as Record<string, unknown>;

    if (typeof s.id !== 'string' || !SERVICE_ID_PATTERN.test(s.id)) {
        errors.push('Service id must match pattern svc_[a-zA-Z0-9_]{1,64}');
    }

    if (typeof s.name !== 'string' || s.name.length === 0 || s.name.length > 256) {
        errors.push('Service name is required (1-256 chars)');
    }

    if (typeof s.category !== 'string' || s.category.length === 0 || s.category.length > 64) {
        errors.push('Service category is required (1-64 chars)');
    }

    if (!s.pricing) {
        errors.push('Pricing is required');
    } else {
        const pricingResult = validatePricing(s.pricing);
        errors.push(...pricingResult.errors.map(e => `pricing: ${e}`));
    }

    if (typeof s.delivery !== 'string') {
        errors.push('Delivery method is required');
    } else {
        const validDelivery = ['realtime', 'async', 'scheduled', 'sse', 'webhook', 'download', 'a2a_task'];
        if (!validDelivery.includes(s.delivery)) {
            errors.push(`Delivery must be one of: ${validDelivery.join(', ')}`);
        }
    }

    if (s.tags !== undefined) {
        if (!Array.isArray(s.tags)) {
            errors.push('Tags must be an array');
        } else if (s.tags.length > 20) {
            errors.push('Maximum 20 tags allowed');
        }
    }

    if (s.status !== undefined) {
        const validStatuses = ['active', 'paused', 'sold_out', 'coming_soon'];
        if (!validStatuses.includes(s.status as string)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }
    }

    if (s.negotiable !== undefined && typeof s.negotiable !== 'boolean') {
        errors.push('Negotiable must be a boolean');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a service catalog (entity + services array).
 */
export function validateServiceCatalog(catalog: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof catalog !== 'object' || catalog === null) {
        return { valid: false, errors: ['Service catalog must be an object'] };
    }

    const c = catalog as Record<string, unknown>;

    if (typeof c.entity_did !== 'string' || c.entity_did.length === 0) {
        errors.push('entity_did is required');
    }

    if (!Array.isArray(c.services)) {
        errors.push('services must be an array');
    } else {
        if (c.services.length > 100) {
            errors.push('Maximum 100 services per catalog');
        }

        // Check for duplicate service IDs
        const ids = new Set<string>();
        for (let i = 0; i < c.services.length; i++) {
            const result = validateServiceListing(c.services[i]);
            errors.push(...result.errors.map(e => `services[${i}]: ${e}`));

            const sid = (c.services[i] as Record<string, unknown>)?.id;
            if (typeof sid === 'string') {
                if (ids.has(sid)) {
                    errors.push(`services[${i}]: Duplicate service id "${sid}"`);
                }
                ids.add(sid);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a review.
 */
export function validateReview(review: unknown): ValidationResult {
    const errors: string[] = [];

    if (typeof review !== 'object' || review === null) {
        return { valid: false, errors: ['Review must be an object'] };
    }

    const r = review as Record<string, unknown>;

    if (typeof r.reviewer_did !== 'string' || r.reviewer_did.length === 0) {
        errors.push('reviewer_did is required');
    }

    if (typeof r.score !== 'number' || !Number.isInteger(r.score) || r.score < 1 || r.score > 5) {
        errors.push('Score must be an integer 1-5');
    }

    if (typeof r.service_id !== 'string' || r.service_id.length === 0) {
        errors.push('service_id is required');
    }

    if (r.comment !== undefined && (typeof r.comment !== 'string' || r.comment.length > 2048)) {
        errors.push('Comment must be a string, max 2048 chars');
    }

    return { valid: errors.length === 0, errors };
}
