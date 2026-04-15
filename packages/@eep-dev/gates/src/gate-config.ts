/**
 * @eep-dev/gates — Gate Config
 *
 * Parse, validate, and serialize EEP gate configurations.
 * Validates tier structure, requirement types, and access patterns.
 */

import type { GateConfig, Tier, Requirement, RequirementType } from './types.js';

// ── Validation Constants ──────────────────────────────────────────────────────

const TIER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const ACCESS_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?$|^\*$/;
const CURRENCY_PATTERN = /^[a-z]{3}$/;
const MAX_TIERS = 20;
const MAX_REQUIREMENTS = 10;
const MAX_ACCESS_PATTERNS = 100;

const STANDARD_REQUIREMENT_TYPES: ReadonlySet<string> = new Set([
    'payment', 'trust', 'identity', 'connection',
    'credential', 'capability', 'allowlist', 'reciprocal',
    'data_request', 'agreement', 'combined', 'standard_residency', 'proof_of_intent',
]);

// ── Error Types ───────────────────────────────────────────────────────────────

export class GateConfigError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly code: string,
    ) {
        super(message);
        this.name = 'GateConfigError';
    }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateTierKey(key: string): void {
    if (!TIER_KEY_PATTERN.test(key)) {
        throw new GateConfigError(
            `Invalid tier key "${key}": must be lowercase alphanumeric + underscores, 1-32 chars`,
            `tiers.${key}`,
            'invalid_tier_key',
        );
    }
}

function validateAccessPattern(pattern: string, tierKey: string): void {
    if (!ACCESS_PATTERN.test(pattern)) {
        throw new GateConfigError(
            `Invalid access pattern "${pattern}" in tier "${tierKey}"`,
            `tiers.${tierKey}.access`,
            'invalid_access_pattern',
        );
    }
}

function validateRequirementType(type: string): type is RequirementType {
    if (STANDARD_REQUIREMENT_TYPES.has(type)) return true;
    if (type.startsWith('x-') && type.length > 2) return true;
    return false;
}

function validatePaymentRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (typeof req.amount !== 'number' || req.amount <= 0) {
        throw new GateConfigError('Payment amount must be a positive number', `tiers.${tierKey}.requirements`, 'invalid_payment_amount');
    }
    if (typeof req.currency !== 'string' || !CURRENCY_PATTERN.test(req.currency)) {
        throw new GateConfigError('Currency must be a 3-letter lowercase ISO 4217 code', `tiers.${tierKey}.requirements`, 'invalid_currency');
    }
    const validPeriods = ['request', 'hour', 'day', 'week', 'month', 'year', 'once'];
    if (typeof req.per !== 'string' || !validPeriods.includes(req.per)) {
        throw new GateConfigError(`Payment "per" must be one of: ${validPeriods.join(', ')}`, `tiers.${tierKey}.requirements`, 'invalid_payment_period');
    }
}

function validateTrustRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (typeof req.min_score !== 'number' || req.min_score < 0 || req.min_score > 100 || !Number.isInteger(req.min_score)) {
        throw new GateConfigError('Trust min_score must be an integer 0-100', `tiers.${tierKey}.requirements`, 'invalid_trust_score');
    }
}

function validateIdentityRequirement(req: Record<string, unknown>, tierKey: string): void {
    const validMethods = ['did_verified', 'email_verified', 'domain_verified', 'kyc', 'any'];
    if (typeof req.method !== 'string' || !validMethods.includes(req.method)) {
        throw new GateConfigError(`Identity method must be one of: ${validMethods.join(', ')}`, `tiers.${tierKey}.requirements`, 'invalid_identity_method');
    }
}

function validateConnectionRequirement(req: Record<string, unknown>, tierKey: string): void {
    const validRelations = ['follower', 'following', 'mutual', 'any'];
    if (typeof req.relation !== 'string' || !validRelations.includes(req.relation)) {
        throw new GateConfigError(`Connection relation must be one of: ${validRelations.join(', ')}`, `tiers.${tierKey}.requirements`, 'invalid_connection_relation');
    }
}

function validateCredentialRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (typeof req.credential_type !== 'string' || req.credential_type.length === 0) {
        throw new GateConfigError('Credential type is required', `tiers.${tierKey}.requirements`, 'missing_credential_type');
    }
}

function validateCapabilityRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (!Array.isArray(req.required_capabilities) || req.required_capabilities.length === 0) {
        throw new GateConfigError('Capability requirement needs at least one capability', `tiers.${tierKey}.requirements`, 'missing_capabilities');
    }
}

function validateAllowlistRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (!Array.isArray(req.dids) || req.dids.length === 0) {
        throw new GateConfigError('Allowlist must contain at least one DID', `tiers.${tierKey}.requirements`, 'empty_allowlist');
    }
    if (req.dids.length > 1000) {
        throw new GateConfigError('Allowlist cannot exceed 1000 DIDs', `tiers.${tierKey}.requirements`, 'allowlist_too_large');
    }
}

function validateReciprocalRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (typeof req.access_level !== 'string' || req.access_level.length === 0) {
        throw new GateConfigError('Reciprocal access_level is required', `tiers.${tierKey}.requirements`, 'missing_access_level');
    }
}

function validateCombinedRequirement(req: Record<string, unknown>, tierKey: string): void {
    if (req.combine_mode !== 'all' && req.combine_mode !== 'any') {
        throw new GateConfigError('combined requirement needs combine_mode "all" or "any"', `tiers.${tierKey}.requirements`, 'invalid_combine_mode');
    }
    if (!Array.isArray(req.requirements) || req.requirements.length < 2) {
        throw new GateConfigError('combined requirement needs at least 2 nested requirements', `tiers.${tierKey}.requirements`, 'invalid_combined_requirements');
    }
    if (req.requirements.length > MAX_REQUIREMENTS) {
        throw new GateConfigError(`combined nested requirements exceed max ${MAX_REQUIREMENTS}`, `tiers.${tierKey}.requirements`, 'too_many_nested');
    }
    for (const sub of req.requirements) {
        validateRequirement(sub, tierKey);
    }
}

function validateRequirement(req: unknown, tierKey: string): asserts req is Requirement {
    if (typeof req !== 'object' || req === null) {
        throw new GateConfigError('Requirement must be an object', `tiers.${tierKey}.requirements`, 'invalid_requirement');
    }

    const r = req as Record<string, unknown>;
    if (typeof r.type !== 'string') {
        throw new GateConfigError('Requirement must have a "type" field', `tiers.${tierKey}.requirements`, 'missing_type');
    }
    if (!validateRequirementType(r.type)) {
        throw new GateConfigError(`Unknown requirement type "${r.type}". Use standard types or x- prefix for custom.`, `tiers.${tierKey}.requirements`, 'unknown_type');
    }

    // Type-specific validation
    switch (r.type) {
        case 'payment': validatePaymentRequirement(r, tierKey); break;
        case 'trust': validateTrustRequirement(r, tierKey); break;
        case 'identity': validateIdentityRequirement(r, tierKey); break;
        case 'connection': validateConnectionRequirement(r, tierKey); break;
        case 'credential': validateCredentialRequirement(r, tierKey); break;
        case 'capability': validateCapabilityRequirement(r, tierKey); break;
        case 'allowlist': validateAllowlistRequirement(r, tierKey); break;
        case 'reciprocal': validateReciprocalRequirement(r, tierKey); break;
        case 'combined': validateCombinedRequirement(r, tierKey); break;
        case 'data_request':
        case 'agreement':
        case 'standard_residency':
        case 'proof_of_intent':
            break;
        default:
            break;
    }
}

function validateTier(tier: unknown, key: string): asserts tier is Tier {
    if (typeof tier !== 'object' || tier === null) {
        throw new GateConfigError(`Tier "${key}" must be an object`, `tiers.${key}`, 'invalid_tier');
    }

    const t = tier as Record<string, unknown>;

    // Requirements
    if (!Array.isArray(t.requirements)) {
        throw new GateConfigError(`Tier "${key}" must have a "requirements" array`, `tiers.${key}.requirements`, 'missing_requirements');
    }
    if (t.requirements.length > MAX_REQUIREMENTS) {
        throw new GateConfigError(`Tier "${key}" has too many requirements (max ${MAX_REQUIREMENTS})`, `tiers.${key}.requirements`, 'too_many_requirements');
    }
    for (const req of t.requirements) {
        validateRequirement(req, key);
    }

    // Access patterns
    if (!Array.isArray(t.access) || t.access.length === 0) {
        throw new GateConfigError(`Tier "${key}" must have at least one access pattern`, `tiers.${key}.access`, 'missing_access');
    }
    if (t.access.length > MAX_ACCESS_PATTERNS) {
        throw new GateConfigError(`Tier "${key}" has too many access patterns (max ${MAX_ACCESS_PATTERNS})`, `tiers.${key}.access`, 'too_many_access');
    }
    for (const pattern of t.access) {
        if (typeof pattern !== 'string') {
            throw new GateConfigError(`Access pattern must be a string in tier "${key}"`, `tiers.${key}.access`, 'invalid_access_type');
        }
        validateAccessPattern(pattern, key);
    }

    // Optional label
    if (t.label !== undefined && (typeof t.label !== 'string' || t.label.length > 128)) {
        throw new GateConfigError(`Tier label must be a string, max 128 chars`, `tiers.${key}.label`, 'invalid_label');
    }

    // Optional description
    if (t.description !== undefined && (typeof t.description !== 'string' || t.description.length > 512)) {
        throw new GateConfigError(`Tier description must be a string, max 512 chars`, `tiers.${key}.description`, 'invalid_description');
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse and validate a raw gate configuration object.
 * Throws GateConfigError on invalid input.
 */
export function parseGateConfig(raw: unknown): GateConfig {
    if (typeof raw !== 'object' || raw === null) {
        throw new GateConfigError('Gate config must be an object', 'root', 'invalid_config');
    }

    const config = raw as Record<string, unknown>;

    // default_tier
    if (typeof config.default_tier !== 'string') {
        throw new GateConfigError('default_tier is required and must be a string', 'default_tier', 'missing_default_tier');
    }
    validateTierKey(config.default_tier);

    // tiers
    if (typeof config.tiers !== 'object' || config.tiers === null || Array.isArray(config.tiers)) {
        throw new GateConfigError('tiers must be an object', 'tiers', 'invalid_tiers');
    }

    const tierKeys = Object.keys(config.tiers as object);
    if (tierKeys.length === 0) {
        throw new GateConfigError('At least one tier is required', 'tiers', 'empty_tiers');
    }
    if (tierKeys.length > MAX_TIERS) {
        throw new GateConfigError(`Maximum ${MAX_TIERS} tiers allowed`, 'tiers', 'too_many_tiers');
    }

    // Validate each tier
    const tiers = config.tiers as Record<string, unknown>;
    for (const key of tierKeys) {
        validateTierKey(key);
        validateTier(tiers[key], key);
    }

    // default_tier must exist in tiers
    if (!(config.default_tier in tiers)) {
        throw new GateConfigError(`default_tier "${config.default_tier}" must exist in tiers`, 'default_tier', 'default_tier_not_found');
    }

    // default_tier must have empty requirements
    const defaultTier = tiers[config.default_tier] as Tier;
    if (defaultTier.requirements.length > 0) {
        throw new GateConfigError(`default_tier "${config.default_tier}" must have zero requirements (publicly accessible)`, 'default_tier', 'default_tier_has_requirements');
    }

    // fallback_behavior
    if (config.fallback_behavior !== undefined) {
        if (config.fallback_behavior !== 'restrict' && config.fallback_behavior !== 'default') {
            throw new GateConfigError('fallback_behavior must be "restrict" or "default"', 'fallback_behavior', 'invalid_fallback');
        }
    }

    return {
        default_tier: config.default_tier,
        tiers: tiers as Record<string, Tier>,
        fallback_behavior: (config.fallback_behavior as 'restrict' | 'default') || 'restrict',
    };
}

/**
 * Serialize a gate configuration to a plain JSON object.
 */
export function serializeGateConfig(config: GateConfig): Record<string, unknown> {
    return JSON.parse(JSON.stringify(config));
}

/**
 * List all requirement types used in a gate configuration.
 */
function collectRequirementTypes(req: Requirement, into: Set<RequirementType>): void {
    into.add(req.type);
    if (req.type === 'combined') {
        for (const sub of req.requirements) {
            collectRequirementTypes(sub, into);
        }
    }
}

export function getUsedRequirementTypes(config: GateConfig): Set<RequirementType> {
    const types = new Set<RequirementType>();
    for (const tier of Object.values(config.tiers)) {
        for (const req of tier.requirements) {
            collectRequirementTypes(req, types);
        }
    }
    return types;
}
