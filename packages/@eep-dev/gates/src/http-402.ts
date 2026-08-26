/**
 * @eep-dev/gates — HTTP 402 Response Builder
 *
 * Builds spec-compliant 402 (Access Restricted) responses
 * with unmet requirements, available tiers, and resolution hints.
 */

import type { GateConfig, GateProof, AccessRestrictionResponse, RateLimitResponse, Requirement } from './types.js';
import {
    PROBLEM_TYPE_PAYMENT_REQUIRED,
    PROBLEM_TYPE_RATE_LIMITED,
    PROBLEM_JSON_CONTENT_TYPE,
} from './types.js';
import { resolveAccess } from './access-resolver.js';
import { matchesAny, findTiersForResource } from './resource-matcher.js';

/**
 * Build a 402 Access Restricted response body.
 *
 * @param config - Entity's gate configuration
 * @param resource - The resource that was requested
 * @param proofs - Proofs the agent currently has (may be empty)
 * @param gatesConfigUrl - Optional URL where the full gate config can be fetched
 */
export async function build402Response(
    config: GateConfig,
    resource: string,
    proofs: GateProof[] = [],
    gatesConfigUrl?: string,
): Promise<AccessRestrictionResponse> {
    const accessResult = await resolveAccess(proofs, config, resource);

    // Find the best tier that grants this resource
    const tiersForResource = findTiersForResource(config.tiers, resource);
    const requiredTier = tiersForResource[0] || config.default_tier;

    // Build available_tiers map — only tiers that grant access to this resource
    const available_tiers: Record<string, { label?: string; description?: string; requirements: Requirement[]; access: string[] }> = {};
    for (const tierKey of tiersForResource) {
        const tier = config.tiers[tierKey];
        if (tier && tier.requirements.length > 0) {
            available_tiers[tierKey] = {
                label: tier.label,
                description: tier.description,
                requirements: tier.requirements as Requirement[],
                access: tier.access,
            };
        }
    }

    const response: AccessRestrictionResponse = {
        // RFC 9457 members first: a generic problem-details client reads
        // these, and the EEP fields below are extension members.
        type: PROBLEM_TYPE_PAYMENT_REQUIRED,
        title: 'Payment Required',
        status: 402,
        detail: `Access to '${resource}' requires the '${requiredTier}' tier.`,
        error: 'access_restricted',
        resource,
        current_tier: accessResult.tier,
        required_tier: requiredTier,
        unmet_requirements: accessResult.unmet,
    };

    if (Object.keys(available_tiers).length > 0) {
        response.available_tiers = available_tiers;
    }

    if (gatesConfigUrl) {
        response.gates_config_url = gatesConfigUrl;
    }

    return response;
}

/**
 * Check if a resource requires gating (i.e., not accessible via the default tier).
 */
export function isGatedResource(config: GateConfig, resource: string): boolean {
    const defaultTier = config.tiers[config.default_tier];
    if (!defaultTier) return true;
    return !matchesAny(defaultTier.access, resource);
}

// ── G30: Rate-Limit 429 Response Builder ──────────────────────────────────────

/**
 * Build a spec-compliant HTTP 429 Too Many Requests response body.
 *
 * The signed_challenge prevents IP-rotation evasion — the agent MUST include it
 * as the `X-EEP-RL-Challenge` header on its next retry after the rate-limit window.
 *
 * Per SPECIFICATION.md §3.4.6 and Whitepaper §10.5.
 *
 * @param agentDid - The DID that was rate-limited
 * @param retryAfterSeconds - How many seconds the agent must wait (must match Retry-After header)
 * @param publisherSignFn - Function that signs the challenge with the publisher's DID key.
 *                          In production, this calls the publisher's EdDSA signing key.
 * @param options.limitPerWindow - Optional: declared rate limit (for informational display)
 * @param options.requestsMade - Optional: requests already made in this window
 * @param options.nonceTtlSeconds - Challenge nonce validity window, default 300s
 */
export async function build429Response(
    agentDid: string,
    retryAfterSeconds: number,
    publisherSignFn: (challenge: string) => Promise<string>,
    options: {
        limitPerWindow?: number;
        requestsMade?: number;
        nonceTtlSeconds?: number;
        message?: string;
    } = {}
): Promise<{ body: RateLimitResponse; headers: Record<string, string> }> {
    const { limitPerWindow, requestsMade, nonceTtlSeconds = 300, message } = options;

    const windowResetAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
    const nonce = `erl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    // Use btoa (globally available) instead of Buffer for ESM compatibility
    const toB64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const challengePayload = `v1.${toB64(JSON.stringify({
        nonce,
        did: agentDid,
        exp: Math.floor(Date.now() / 1000) + nonceTtlSeconds,
    }))}`.trimEnd();

    const signature = await publisherSignFn(challengePayload);
    const signedChallenge = `${challengePayload}.${toB64(signature)}`;

    const body: RateLimitResponse = {
        type: PROBLEM_TYPE_RATE_LIMITED,
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded for ${agentDid}; retry after ${retryAfterSeconds}s.`,
        error: 'rate_limited',
        did_rate_limit_key: agentDid,
        retry_after_seconds: retryAfterSeconds,
        window_reset_at: windowResetAt,
        signed_challenge: signedChallenge,
        ...(limitPerWindow !== undefined && { limit_per_window: limitPerWindow }),
        ...(requestsMade !== undefined && { requests_made: requestsMade }),
        ...(message && { message }),
    };

    const headers: Record<string, string> = {
        'Content-Type': PROBLEM_JSON_CONTENT_TYPE,
        'Retry-After': String(retryAfterSeconds),
        'X-EEP-Rate-Limit-DID': agentDid,
        'X-EEP-Rate-Reset': windowResetAt,
    };

    return { body, headers };
}

