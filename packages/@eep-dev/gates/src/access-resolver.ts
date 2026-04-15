/**
 * @eep-dev/gates — Access Resolver
 *
 * Determines which tier an agent has access to based on their proofs
 * and the entity's gate configuration.
 */

import type { GateConfig, GateProof, AccessResult, UnmetRequirement, Requirement, CombinedRequirement } from './types.js';
import { matchesAny } from './resource-matcher.js';
import { validateProofStructure } from './proof-validator.js';
import type { ProofVerifierRegistry } from './proof-validator.js';

export interface ResolveAccessOptions {
    /**
     * Fail-closed mode for requirement verification.
     * - true (default): a requirement is satisfied only when a semantic verifier exists and returns true.
     * - false: allows structural-only fallback when no semantic verifier is registered.
     */
    strictSemanticVerification?: boolean;
}

/**
 * Resolve which tier a set of proofs grants access to.
 * Tests tiers from most-permissive to least-permissive and returns the best match.
 *
 * @param proofs - Gate proofs provided by the agent
 * @param config - Entity's gate configuration
 * @param resource - Optional: specific resource being accessed
 * @param verifierRegistry - Optional: platform-level proof verifiers for semantic checks
 */
export async function resolveAccess(
    proofs: GateProof[],
    config: GateConfig,
    resource?: string,
    verifierRegistry?: ProofVerifierRegistry,
    options: ResolveAccessOptions = {},
): Promise<AccessResult> {
    const strictSemanticVerification = options.strictSemanticVerification ?? true;

    // Group proofs by type for quick lookup
    const proofsByType = new Map<string, GateProof[]>();
    for (const proof of proofs) {
        const existing = proofsByType.get(proof.type) || [];
        existing.push(proof);
        proofsByType.set(proof.type, existing);
    }

    // Try each tier and find the best one the proofs satisfy
    let bestTier = config.default_tier;
    let bestAccessCount = 0;

    for (const [tierKey, tier] of Object.entries(config.tiers)) {
        if (tierKey === config.default_tier) continue; // Skip default tier (always granted)
        if (tier.requirements.length === 0) continue; // Skip tiers with no requirements (shouldn't exist except default)
        // When resolving for a specific resource, ignore tiers that cannot grant it (avoids
        // a less-specific tier "winning" because its requirements are a subset of another tier's).
        if (resource && !matchesAny(tier.access, resource)) continue;

        const unmet = await checkRequirements(
            tier.requirements,
            proofsByType,
            verifierRegistry,
            strictSemanticVerification,
        );

        if (unmet.length === 0) {
            // All requirements met — is this tier better than current best?
            const accessCount = tier.access.includes('*') ? Infinity : tier.access.length;
            if (accessCount > bestAccessCount) {
                bestTier = tierKey;
                bestAccessCount = accessCount;
            }
        }
    }

    // If a resource was specified, check if the best tier grants access to it
    if (resource) {
        const bestTierConfig = config.tiers[bestTier];
        if (bestTierConfig && matchesAny(bestTierConfig.access, resource)) {
            return { granted: true, tier: bestTier, unmet: [] };
        }

        // Access denied — find which tiers WOULD grant access and their unmet requirements
        const unmetForBestTier = await getUnmetForResource(
            config, resource, proofsByType, verifierRegistry,
            strictSemanticVerification,
        );
        return { granted: false, tier: bestTier, unmet: unmetForBestTier };
    }

    return { granted: true, tier: bestTier, unmet: [] };
}

/**
 * Check whether a single requirement (including nested combined) is satisfied.
 */
async function checkOneRequirement(
    req: Requirement,
    proofsByType: Map<string, GateProof[]>,
    verifierRegistry?: ProofVerifierRegistry,
    strictSemanticVerification = true,
): Promise<UnmetRequirement[]> {
    if (req.type === 'combined') {
        return checkCombinedRequirement(req as CombinedRequirement, proofsByType, verifierRegistry, strictSemanticVerification);
    }

    const proofs = proofsByType.get(req.type);

    if (!proofs || proofs.length === 0) {
        return [requirementToUnmet(req)];
    }

    // At least one proof of this type exists — check structural validity
    let structurallyValid = false;
    for (const proof of proofs) {
        const result = validateProofStructure(proof);
        if (result.valid) {
            structurallyValid = true;

            // Semantic check via verifier registry.
            if (verifierRegistry && verifierRegistry.hasVerifier(req.type)) {
                const semanticValid = await verifierRegistry.verify(proof, req);
                if (semanticValid) {
                    structurallyValid = true;
                    break;
                } else {
                    structurallyValid = false;
                }
            } else {
                // No semantic verifier available for this requirement type.
                if (strictSemanticVerification) {
                    structurallyValid = false;
                    continue;
                }
                break;
            }
        }
    }

    if (!structurallyValid) {
        return [requirementToUnmet(req)];
    }

    return [];
}

async function checkCombinedRequirement(
    req: CombinedRequirement,
    proofsByType: Map<string, GateProof[]>,
    verifierRegistry?: ProofVerifierRegistry,
    strictSemanticVerification = true,
): Promise<UnmetRequirement[]> {
    const nested = await Promise.all(
        req.requirements.map((sub) =>
            checkOneRequirement(sub, proofsByType, verifierRegistry, strictSemanticVerification),
        ),
    );

    if (req.combine_mode === 'all') {
        return nested.flat();
    }

    const anySatisfied = nested.some((u) => u.length === 0);
    if (anySatisfied) {
        return [];
    }
    return nested.flat();
}

/**
 * Check which requirements from a list are NOT satisfied by the provided proofs.
 */
async function checkRequirements(
    requirements: Requirement[],
    proofsByType: Map<string, GateProof[]>,
    verifierRegistry?: ProofVerifierRegistry,
    strictSemanticVerification = true,
): Promise<UnmetRequirement[]> {
    const unmet: UnmetRequirement[] = [];

    for (const req of requirements) {
        const part = await checkOneRequirement(req, proofsByType, verifierRegistry, strictSemanticVerification);
        unmet.push(...part);
    }

    return unmet;
}

/**
 * For a denied resource, find the unmet requirements across all tiers that could grant access.
 */
async function getUnmetForResource(
    config: GateConfig,
    resource: string,
    proofsByType: Map<string, GateProof[]>,
    verifierRegistry?: ProofVerifierRegistry,
    strictSemanticVerification = true,
): Promise<UnmetRequirement[]> {
    // Find the tier with the fewest unmet requirements that grants this resource
    let bestUnmet: UnmetRequirement[] | null = null;

    for (const [, tier] of Object.entries(config.tiers)) {
        if (!matchesAny(tier.access, resource)) continue;
        if (tier.requirements.length === 0) continue;

        const unmet = await checkRequirements(
            tier.requirements,
            proofsByType,
            verifierRegistry,
            strictSemanticVerification,
        );
        if (bestUnmet === null || unmet.length < bestUnmet.length) {
            bestUnmet = unmet;
        }
    }

    return bestUnmet || [];
}

/**
 * Convert a requirement to an unmet requirement with a resolution hint.
 */
function requirementToUnmet(req: Requirement): UnmetRequirement {
    const base: UnmetRequirement = { type: req.type };

    switch (req.type) {
        case 'payment':
            base.resolution_hint = `Payment required: ${req.amount} ${req.currency} per ${req.per}`;
            if (req.payment_methods?.length) {
                (base as Record<string, unknown>).payment_methods = req.payment_methods;
            }
            break;
        case 'trust':
            base.resolution_hint = `Minimum trust score of ${req.min_score} required`;
            (base as Record<string, unknown>).min_score = req.min_score;
            break;
        case 'identity':
            base.resolution_hint = `Identity verification required: ${req.method}`;
            break;
        case 'connection':
            base.resolution_hint = `Social connection required: ${req.relation}`;
            break;
        case 'credential':
            base.resolution_hint = `Verifiable Credential required: ${req.credential_type}`;
            if (req.issuer) {
                base.resolution_hint += ` from ${req.issuer}`;
            }
            break;
        case 'capability':
            base.resolution_hint = `Agent capabilities required: ${req.required_capabilities.join(', ')}`;
            break;
        case 'allowlist':
            base.resolution_hint = `Your DID must be on the entity's allowlist`;
            break;
        case 'reciprocal':
            base.resolution_hint = `Reciprocal access of "${req.access_level}" must be granted back`;
            break;
        case 'combined':
            base.resolution_hint = `Combined gate (${req.combine_mode}): satisfy nested requirements`;
            (base as Record<string, unknown>).combine_mode = req.combine_mode;
            break;
        default:
            base.resolution_hint = `Requirement of type "${req.type}" not satisfied`;
    }

    return base;
}
