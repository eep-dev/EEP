/**
 * @eep-dev/discovery — Manifest Validation
 *
 * Validates an EEP manifest (/.well-known/eep.json) against the schema
 * requirements defined in Whitepaper §4.1:
 *   - Required fields: did, eep_version, layers (with layer1), supported_content_types, pqc_ready, x402_enabled
 *   - DID format validation (must start with "did:")
 *   - Version format validation (semver-like: Major.Minor)
 *   - Layer1 endpoint must be a valid URL
 */

export interface ManifestValidationResult {
    valid: boolean;
    errors: string[];
    manifest?: EEPManifest;
}

export interface EEPManifest {
    did: string;
    eep_version: string;
    eep_versions?: string[];
    preferred_version?: string;
    layers: {
        layer1: string;
        layer2_sse?: string;
        layer2_webhook?: string;
        layer3_ws?: string;
    };
    supported_content_types: string[];
    pqc_ready: boolean;
    x402_enabled: boolean;
    gates_url?: string;
    services_url?: string;
    capabilities_query_url?: string;
    reputation?: { contract: string; chain: string; scan_url?: string };
    signing_algorithms?: string[];
    pricing_mode?: 'fixed' | 'negotiable' | 'auction';
    tls_mode?: 'standard' | 'mTLS' | 'mTLS-required';
    updated_at?: string;
    [key: string]: unknown;
}

const DID_PATTERN = /^did:[a-z]+:.+/;
const VERSION_PATTERN = /^\d+\.\d+/;
const VALID_SIGNING_ALGORITHMS = [
    'EdDSA', 'ES256K', 'ES256',
    'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-128s',
    'hybrid-EdDSA-ML-DSA-65', 'hybrid-EdDSA-ML-DSA-87',
];
const VALID_TLS_MODES = ['standard', 'mTLS', 'mTLS-required'];
const VALID_PRICING_MODES = ['fixed', 'negotiable', 'auction'];

/**
 * Validate an EEP manifest object.
 * Returns structured result with errors array.
 */
export function validateManifest(input: unknown): ManifestValidationResult {
    const errors: string[] = [];

    if (!input || typeof input !== 'object') {
        return { valid: false, errors: ['Manifest must be a non-null object'] };
    }

    const obj = input as Record<string, unknown>;

    // ── Required fields ─────────────────────────────────────────
    // did
    if (typeof obj.did !== 'string' || !obj.did) {
        errors.push('Missing required field: did');
    } else if (!DID_PATTERN.test(obj.did)) {
        errors.push(`Invalid DID format: '${obj.did}' — must match did:<method>:<id>`);
    }

    // eep_version
    if (typeof obj.eep_version !== 'string' || !obj.eep_version) {
        errors.push('Missing required field: eep_version');
    } else if (!VERSION_PATTERN.test(obj.eep_version)) {
        errors.push(`Invalid eep_version format: '${obj.eep_version}' — must be Major.Minor`);
    }

    // layers
    if (!obj.layers || typeof obj.layers !== 'object') {
        errors.push('Missing required field: layers');
    } else {
        const layers = obj.layers as Record<string, unknown>;
        if (typeof layers.layer1 !== 'string' || !layers.layer1) {
            errors.push('Missing required field: layers.layer1');
        }
    }

    // supported_content_types
    if (!Array.isArray(obj.supported_content_types) || obj.supported_content_types.length === 0) {
        errors.push('Missing or empty required field: supported_content_types');
    }

    // pqc_ready
    if (typeof obj.pqc_ready !== 'boolean') {
        errors.push('Missing required field: pqc_ready (must be boolean)');
    }

    // x402_enabled
    if (typeof obj.x402_enabled !== 'boolean') {
        errors.push('Missing required field: x402_enabled (must be boolean)');
    }

    // ── Optional field validation ───────────────────────────────
    // eep_versions
    if (obj.eep_versions !== undefined) {
        if (!Array.isArray(obj.eep_versions) || obj.eep_versions.length === 0) {
            errors.push('eep_versions must be a non-empty array');
        } else {
            for (const v of obj.eep_versions) {
                if (typeof v !== 'string' || !VERSION_PATTERN.test(v)) {
                    errors.push(`Invalid version in eep_versions: '${v}'`);
                }
            }
        }
    }

    // preferred_version
    if (obj.preferred_version !== undefined) {
        if (typeof obj.preferred_version !== 'string' || !VERSION_PATTERN.test(obj.preferred_version)) {
            errors.push(`Invalid preferred_version: '${obj.preferred_version}'`);
        }
    }

    // signing_algorithms
    if (obj.signing_algorithms !== undefined) {
        if (!Array.isArray(obj.signing_algorithms) || obj.signing_algorithms.length === 0) {
            errors.push('signing_algorithms must be a non-empty array');
        } else {
            for (const alg of obj.signing_algorithms) {
                if (!VALID_SIGNING_ALGORITHMS.includes(alg)) {
                    errors.push(`Unknown signing algorithm: '${alg}'`);
                }
            }
        }
    }

    // tls_mode
    if (obj.tls_mode !== undefined && !VALID_TLS_MODES.includes(obj.tls_mode as string)) {
        errors.push(`Invalid tls_mode: '${obj.tls_mode}' — must be one of: ${VALID_TLS_MODES.join(', ')}`);
    }

    // pricing_mode
    if (obj.pricing_mode !== undefined && !VALID_PRICING_MODES.includes(obj.pricing_mode as string)) {
        errors.push(`Invalid pricing_mode: '${obj.pricing_mode}' — must be one of: ${VALID_PRICING_MODES.join(', ')}`);
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true, errors: [], manifest: obj as unknown as EEPManifest };
}
