/**
 * @eep-dev/gates — Proof Validator & Verifier
 *
 * Two-step proof validation:
 * 1. Structural validation (protocol-level): Does the proof have the right fields? Is it fresh?
 *    → This module handles structural validation.
 * 2. Semantic validation (platform-level): Is the payment token actually valid? Does the VC verify?
 *    → Implementing platforms provide a ProofVerifier.
 */

import { createHash } from 'crypto';
import type {
    GateProof,
    RequirementType,
    Requirement,
    DelegationCredentialSubject,
    DataRequestRequirement,
} from './types.js';

// ── Structural Validation ─────────────────────────────────────────────────────

export interface ProofValidationResult {
    valid: boolean;
    errors: string[];
}

export type SecurityMetricName =
    | 'eep.replay.detected_total'
    | 'eep.nonce.consumed_total'
    | 'eep.payment.double_spend_detected_total'
    | 'eep.payment.hash_consumed_total';

export const CRITICAL_SECURITY_METRICS: readonly SecurityMetricName[] = [
    'eep.replay.detected_total',
    'eep.nonce.consumed_total',
    'eep.payment.double_spend_detected_total',
    'eep.payment.hash_consumed_total',
] as const;

export interface SecurityTelemetryRecorder {
    emit(
        metric: SecurityMetricName,
        value: number,
        attributes?: Record<string, string | number | boolean>
    ): void | Promise<void>;
}

let globalSecurityTelemetryRecorder: SecurityTelemetryRecorder | undefined;

export function setGlobalSecurityTelemetryRecorder(
    recorder: SecurityTelemetryRecorder | undefined
): void {
    globalSecurityTelemetryRecorder = recorder;
}

export function getGlobalSecurityTelemetryRecorder(): SecurityTelemetryRecorder | undefined {
    return globalSecurityTelemetryRecorder;
}

async function emitMetric(
    recorder: SecurityTelemetryRecorder | undefined,
    metric: SecurityMetricName,
    attributes?: Record<string, string | number | boolean>
): Promise<void> {
    const sink = recorder ?? globalSecurityTelemetryRecorder;
    if (!sink) return;
    await sink.emit(metric, 1, attributes);
}

/**
 * Validate the structural integrity of a gate proof.
 * Does NOT verify semantic validity (e.g., whether a payment was actually made).
 */
export function validateProofStructure(proof: unknown): ProofValidationResult {
    const errors: string[] = [];

    if (typeof proof !== 'object' || proof === null) {
        return { valid: false, errors: ['Proof must be an object'] };
    }

    const p = proof as Record<string, unknown>;

    // type is required
    if (typeof p.type !== 'string' || p.type.length === 0) {
        errors.push('Proof must have a "type" field');
        return { valid: false, errors };
    }

    // Check freshness if timestamps present
    if (p.expires_at) {
        if (typeof p.expires_at !== 'string') {
            errors.push('expires_at must be an ISO 8601 string');
        } else {
            const expiry = new Date(p.expires_at);
            if (isNaN(expiry.getTime())) {
                errors.push('expires_at is not a valid date');
            } else if (expiry.getTime() < Date.now()) {
                errors.push('Proof has expired');
            }
        }
    }

    if (p.issued_at) {
        if (typeof p.issued_at !== 'string') {
            errors.push('issued_at must be an ISO 8601 string');
        } else {
            const issued = new Date(p.issued_at);
            if (isNaN(issued.getTime())) {
                errors.push('issued_at is not a valid date');
            } else if (issued.getTime() > Date.now() + 60_000) {
                // Allow 1 minute clock skew
                errors.push('Proof issued_at is in the future');
            }
        }
    }

    // Type-specific structural checks
    switch (p.type) {
        case 'payment': {
            const hasToken = typeof p.token === 'string' && p.token.length > 0;
            const hasX402 = p.x402_payload !== undefined;
            if (!hasToken && !hasX402) {
                errors.push('Payment proof must have a non-empty "token" or an "x402_payload"');
            }
            // Validate x402 payload structure if present
            if (hasX402) {
                const xp = p.x402_payload as Record<string, unknown>;
                if (typeof xp.payload !== 'string' || xp.payload.length === 0) {
                    errors.push('x402_payload.payload must be a non-empty EIP-712 string');
                }
                if (typeof xp.signature !== 'string' || !/^0x[0-9a-fA-F]{128,}$/.test(xp.signature)) {
                    errors.push('x402_payload.signature must be a valid hex secp256k1 signature');
                }
                if (typeof xp.network !== 'string' || xp.network.length === 0) {
                    errors.push('x402_payload.network is required');
                }
            }
            break;
        }
        case 'trust':
            if (p.self_attested !== true) {
                errors.push('Trust proof must have self_attested=true');
            }
            break;
        case 'identity':
            if (typeof p.method !== 'string') {
                errors.push('Identity proof must have a "method"');
            }
            break;
        case 'connection':
            if (typeof p.subscriber_did !== 'string') {
                errors.push('Connection proof must have a "subscriber_did"');
            }
            break;
        case 'credential':
            if (typeof p.credential !== 'string' || p.credential.length === 0) {
                errors.push('Credential proof must have a "credential"');
            }
            if (typeof p.format !== 'string') {
                errors.push('Credential proof must have a "format"');
            }
            break;
        case 'capability':
            if (!Array.isArray(p.declared_capabilities) || p.declared_capabilities.length === 0) {
                errors.push('Capability proof must have non-empty "declared_capabilities"');
            }
            break;
        case 'allowlist':
            if (typeof p.did !== 'string') {
                errors.push('Allowlist proof must have a "did"');
            }
            break;
        case 'reciprocal':
            if (typeof p.entity_did !== 'string') {
                errors.push('Reciprocal proof must have an "entity_did"');
            }
            if (typeof p.granted_access !== 'string') {
                errors.push('Reciprocal proof must have a "granted_access"');
            }
            break;
        case 'proof_of_intent': {
            // Delegate to poi-validator for structural checks
            const doc = p.intent_document as Record<string, unknown> | undefined;
            if (!doc || typeof doc !== 'object') {
                errors.push('ProofOfIntent must have an "intent_document" object');
            } else {
                const requiredPoiFields = ['intent_id', 'agent_did', 'principal_did', 'action', 'scope', 'principal_signature', 'created_at'];
                for (const f of requiredPoiFields) {
                    if (!doc[f]) errors.push(`intent_document.${f} is required`);
                }
                const scope = doc.scope as Record<string, unknown> | undefined;
                if (!scope?.expires_at) {
                    errors.push('intent_document.scope.expires_at is required');
                } else {
                    const expiry = new Date(scope.expires_at as string).getTime();
                    if (Number.isNaN(expiry)) errors.push('intent_document.scope.expires_at is not valid ISO8601');
                    else if (expiry < Date.now()) errors.push('ProofOfIntent has expired');
                }
            }
            break;
        }
        case 'data_request': {
            if (typeof p.verifiable_presentation !== 'string' || p.verifiable_presentation.length < 10) {
                errors.push('data_request proof must have a non-empty "verifiable_presentation" (JWT VP or JSON-LD)');
            }
            if (p.claimed_fields !== undefined && !Array.isArray(p.claimed_fields)) {
                errors.push('data_request proof.claimed_fields must be an array if present');
            }
            break;
        }
        case 'agreement': {
            if (typeof p.document_hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(p.document_hash)) {
                errors.push('agreement proof must have a valid document_hash (sha256:hex)');
            }
            if (typeof p.signature !== 'string' || p.signature.length < 10) {
                errors.push('agreement proof must have a non-empty "signature"');
            }
            if (typeof p.signer_did !== 'string' || !p.signer_did.startsWith('did:')) {
                errors.push('agreement proof must have a valid "signer_did" (did:method:id)');
            }
            if (p.signature_algo !== undefined && !['EdDSA', 'ES256K'].includes(p.signature_algo as string)) {
                errors.push('agreement proof.signature_algo must be EdDSA or ES256K');
            }
            break;
        }
        default:
            // Custom x- types: no structural validation at protocol level
            if (!p.type.startsWith('x-')) {
                errors.push(`Unknown proof type "${p.type}"`);
            }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate an array of gate proofs.
 */
export function validateProofs(proofs: unknown[]): ProofValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(proofs)) {
        return { valid: false, errors: ['gate_proofs must be an array'] };
    }
    if (proofs.length > 10) {
        return { valid: false, errors: ['Maximum 10 proofs allowed'] };
    }

    for (let i = 0; i < proofs.length; i++) {
        const result = validateProofStructure(proofs[i]);
        if (!result.valid) {
            errors.push(...result.errors.map(e => `proof[${i}]: ${e}`));
        }
    }

    return { valid: errors.length === 0, errors };
}

// ── Proof Verifier Interface (platform-level) ─────────────────────────────────

/**
 * Abstract interface for semantic proof verification.
 * Implementing platforms must provide concrete verifiers for each requirement type.
 *
 * Examples:
 * - PaymentProofVerifier: Check if Stripe payment intent is valid
 * - CredentialProofVerifier: Verify W3C VC signature
 * - TrustProofVerifier: Look up entity's actual trust score
 * - ConnectionProofVerifier: Query social graph for connection
 */
export interface ProofVerifier {
    /**
     * Verify a proof against a requirement.
     * Returns true if the proof semantically satisfies the requirement.
     */
    verify(proof: GateProof, requirement: Requirement): Promise<boolean>;

    /**
     * The requirement types this verifier handles.
     */
    supportedTypes: RequirementType[];
}

/**
 * Registry of proof verifiers.
 * Platforms register verifiers for each requirement type they support.
 */
export class ProofVerifierRegistry {
    private verifiers = new Map<string, ProofVerifier>();

    register(verifier: ProofVerifier): void {
        for (const type of verifier.supportedTypes) {
            this.verifiers.set(type, verifier);
        }
    }

    getVerifier(type: RequirementType): ProofVerifier | undefined {
        return this.verifiers.get(type);
    }

    hasVerifier(type: RequirementType): boolean {
        return this.verifiers.has(type);
    }

    /**
     * Verify a proof against a requirement using the registered verifier.
     * Returns false if no verifier is registered for the requirement type.
     */
    async verify(proof: GateProof, requirement: Requirement): Promise<boolean> {
        const verifier = this.verifiers.get(requirement.type);
        if (!verifier) return false;
        return verifier.verify(proof, requirement);
    }
}

// ── G24: EEP Request Header Validation ───────────────────────────────────────

/**
 * The mandatory EEP request headers defined by the protocol.
 * These MUST be present on every gate proof submission and high-consequence request.
 * See SPECIFICATION.md §3.1.2 and Whitepaper §7 (Security).
 */
export interface EEPRequestHeaders {
    /** Agent's operational DID. Format: did:method:id */
    'EEP-Agent-DID'?: string;
    /** Base64url-encoded EdDSA or ES256K signature over the request payload + nonce + iat */
    'EEP-Signature'?: string;
    /** Single-use nonce issued by the publisher during the 402/403 challenge. Prevents replay attacks. */
    'EEP-Nonce'?: string;
    /** EEP protocol version(s) the agent supports, in preference order (comma-separated) */
    'EEP-Version'?: string;
    /** Signed session token (EEP-Session model) from previous gate completion */
    'EEP-Session'?: string;
    /** Rate-limit signed challenge from a previous 429 response. Required on retry after rate limit. */
    'X-EEP-RL-Challenge'?: string;
    [key: string]: string | undefined;
}

export interface HeaderValidationResult {
    valid: boolean;
    errors: string[];
    /** The DID parsed from EEP-Agent-DID (if valid) */
    agentDid?: string;
    /** The nonce parsed from EEP-Nonce (if present) */
    nonce?: string;
}

/**
 * Validate mandatory EEP request headers on gate proof submissions.
 *
 * According to SPECIFICATION.md §3.1.2 and Whitepaper §7 (Security Architecture):
 * - EEP-Agent-DID: MUST be present and a valid DID
 * - EEP-Signature: MUST be a non-empty base64url or hex string
 * - EEP-Nonce: MUST be present; single-use to prevent replay attacks
 *
 * @param headers - The incoming request headers (case-insensitive key lookup)
 * @param options.requireSignature - Enforce EEP-Signature header (default: true)
 * @param options.requireNonce - Enforce EEP-Nonce header (default: true)
 */
export function validateRequestHeaders(
    headers: Record<string, string | string[] | undefined>,
    options: { requireSignature?: boolean; requireNonce?: boolean } = {}
): HeaderValidationResult {
    const { requireSignature = true, requireNonce = true } = options;
    const errors: string[] = [];

    // Normalize header lookup (case-insensitive)
    const get = (key: string): string | undefined => {
        const lower = key.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === lower) {
                return Array.isArray(v) ? v[0] : v;
            }
        }
        return undefined;
    };

    // ── EEP-Agent-DID ────────────────────────────────────────────────────────
    const agentDid = get('EEP-Agent-DID');
    if (!agentDid) {
        errors.push('Missing required header: EEP-Agent-DID');
    } else if (!/^did:[a-z0-9]+:.+$/.test(agentDid)) {
        errors.push(`Invalid EEP-Agent-DID format: "${agentDid}". Expected did:method:id`);
    }

    // ── EEP-Signature ─────────────────────────────────────────────────────────
    if (requireSignature) {
        const sig = get('EEP-Signature');
        if (!sig) {
            errors.push('Missing required header: EEP-Signature');
        } else if (sig.length < 8) {
            errors.push('EEP-Signature is too short to be a valid EdDSA or ES256K signature');
        } else if (!/^[A-Za-z0-9+/=._-]+$/.test(sig) && !/^0x[0-9a-fA-F]+$/.test(sig)) {
            errors.push('EEP-Signature must be base64url-encoded or hex (0x-prefixed) EdDSA/ES256K signature');
        }
    }

    // ── EEP-Nonce ─────────────────────────────────────────────────────────────
    const nonce = get('EEP-Nonce');
    if (requireNonce) {
        if (!nonce) {
            errors.push('Missing required header: EEP-Nonce (single-use nonce from publisher 402/403 challenge)');
        } else if (nonce.length < 8) {
            errors.push('EEP-Nonce is too short — minimum 8 characters required');
        } else if (nonce.length > 128) {
            errors.push('EEP-Nonce exceeds maximum length of 128 characters');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        agentDid: agentDid && /^did:[a-z0-9]+:.+$/.test(agentDid) ? agentDid : undefined,
        nonce: nonce ?? undefined,
    };
}

// ── G27: Multi-Chain Payment Proof Validator ──────────────────────────────────

/**
 * Declared payment network from the publisher's EEP manifest.
 */
export interface DeclaredPaymentNetwork {
    chain: string;
    address: string;
    min_confirmations: number;
}

export interface PaymentChainValidationResult {
    valid: boolean;
    errors: string[];
    /** The matched network from publisher's manifest (if found) */
    matchedNetwork?: DeclaredPaymentNetwork;
}

/**
 * Validate that a payment proof targets a chain declared in the publisher's manifest
 * and meets the minimum confirmation threshold.
 *
 * According to SPECIFICATION.md §8.3 and Whitepaper §8.3 (Multi-Chain Wallet Management):
 * - The proof's `chain` MUST match a publisher-declared payment_networks[].chain
 * - The `confirmations` field MUST be ≥ the declared min_confirmations for that chain
 *
 * @param proof - The payment proof object from the gate submission
 * @param declaredNetworks - The publisher's payment_networks[] from their EEP manifest
 */
export function validatePaymentChain(
    proof: Record<string, unknown>,
    declaredNetworks: DeclaredPaymentNetwork[]
): PaymentChainValidationResult {
    const errors: string[] = [];

    // Only applies to on-chain payment proofs (must have chain + tx_hash)
    const chain = proof['chain'];
    const txHash = proof['tx_hash'];

    // If neither chain nor tx_hash is present, this is an off-chain token proof — no chain validation needed
    if (!chain && !txHash) {
        return { valid: true, errors: [] };
    }

    // If tx_hash present but not chain, chain is required
    if (txHash && !chain) {
        errors.push('Payment proof with tx_hash must also declare the "chain" field');
        return { valid: false, errors };
    }

    if (typeof chain !== 'string') {
        errors.push('Payment proof "chain" must be a string');
        return { valid: false, errors };
    }

    // Find matching network in publisher's manifest
    const matchedNetwork = declaredNetworks.find(n => n.chain.toLowerCase() === chain.toLowerCase());
    if (!matchedNetwork) {
        const accepted = declaredNetworks.map(n => n.chain).join(', ');
        errors.push(`Chain "${chain}" is not in publisher's declared payment_networks (accepted: ${accepted || 'none'})`);
        return { valid: false, errors };
    }

    // Validate confirmations if min_confirmations > 0
    if (matchedNetwork.min_confirmations > 0) {
        const confirmations = proof['confirmations'];
        if (confirmations === undefined) {
            errors.push(`Chain "${chain}" requires at least ${matchedNetwork.min_confirmations} confirmations — "confirmations" field is missing from proof`);
        } else if (typeof confirmations !== 'number' || confirmations < matchedNetwork.min_confirmations) {
            errors.push(`Payment on chain "${chain}" has insufficient confirmations: got ${confirmations}, need ${matchedNetwork.min_confirmations}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        matchedNetwork: errors.length === 0 ? matchedNetwork : undefined,
    };
}

// ── G29: Nonce Consumed-Ledger (Replay Attack Prevention) ────────────────────

/**
 * Interface for a nonce store used to prevent gate proof replay attacks.
 *
 * Publishers MUST implement this interface and pass it to validateProofWithNonce().
 * The store must be shared across all publisher instances (e.g., backed by Redis with TTL).
 *
 * Per SPECIFICATION.md §10.2 and Whitepaper §10.2:
 * "The nonce is single-use; the publisher marks it consumed upon first successful verification.
 *  Publishers must persist consumed nonces for at least the duration of their expiry window
 *  in a distributed store (e.g., Redis with TTL)."
 *
 * @example Redis implementation:
 * ```typescript
 * class RedisNonceStore implements NonceStore {
 *   constructor(private redis: Redis) {}
 *
 *   async isConsumed(nonce: string): Promise<boolean> {
 *     return (await this.redis.exists(`eep:nonce:${nonce}`)) === 1;
 *   }
 *
 *   async markConsumed(nonce: string, ttlSeconds: number): Promise<void> {
 *     await this.redis.set(`eep:nonce:${nonce}`, '1', 'EX', ttlSeconds);
 *   }
 * }
 * ```
 */
export interface NonceStore {
    /**
     * Check if a nonce has already been consumed.
     * @returns true if the nonce was already used (replay attack), false if it is fresh
     */
    isConsumed(nonce: string): Promise<boolean>;

    /**
     * Mark a nonce as consumed after successful proof validation.
     * The store MUST expire the nonce after ttlSeconds to prevent unbounded growth.
     *
     * @param nonce - The nonce to consume
     * @param ttlSeconds - How long to retain the consumed nonce record. Set to the proof's validity window (typically 60-300 seconds).
     */
    markConsumed(nonce: string, ttlSeconds: number): Promise<void>;

    /**
     * Atomically consume a nonce if it is still fresh.
     * Returns true when nonce was consumed, false when it was already consumed.
     */
    consumeIfFresh?(nonce: string, ttlSeconds: number): Promise<boolean>;
}

/**
 * In-memory nonce store for testing and single-instance deployments.
 * NOT suitable for production use in horizontally-scaled deployments
 * (each instance would have its own nonce tracking — use Redis instead).
 */
export class InMemoryNonceStore implements NonceStore {
    private consumed = new Map<string, number>(); // nonce → expiry (unix ms)

    async isConsumed(nonce: string): Promise<boolean> {
        const expiry = this.consumed.get(nonce);
        if (expiry === undefined) return false;
        if (Date.now() > expiry) {
            this.consumed.delete(nonce);
            return false;
        }
        return true;
    }

    async markConsumed(nonce: string, ttlSeconds: number): Promise<void> {
        this.consumed.set(nonce, Date.now() + ttlSeconds * 1000);
    }

    async consumeIfFresh(nonce: string, ttlSeconds: number): Promise<boolean> {
        const consumed = await this.isConsumed(nonce);
        if (consumed) return false;
        this.consumed.set(nonce, Date.now() + ttlSeconds * 1000);
        return true;
    }

    /** Evict expired entries (call periodically in long-running processes) */
    evictExpired(): void {
        const now = Date.now();
        for (const [nonce, expiry] of this.consumed.entries()) {
            if (now > expiry) this.consumed.delete(nonce);
        }
    }
}

export interface NonceValidationResult extends ProofValidationResult {
    /** true if this proof was rejected because the nonce was replayed */
    isReplay?: boolean;
}

export interface NonceValidationOptions {
    /** Override nonce source (useful when nonce is only carried in headers). */
    nonce?: string;
    /** How long to retain nonce consumption record. */
    nonceTtlSeconds?: number;
    /**
     * If false, performs replay check without consuming nonce.
     * Useful for preflight checks before semantic verification.
     */
    markConsumed?: boolean;
    telemetry?: SecurityTelemetryRecorder;
}

/**
 * Validate a gate proof AND enforce nonce uniqueness via the nonce store.
 * This is the recommended validation entry point for production publishers.
 *
 * On success, the nonce is automatically marked as consumed.
 * On failure due to replay, isReplay is set to true on the result.
 *
 * @param proof - The proof to validate
 * @param nonceStore - A NonceStore implementation (use RedisNonceStore in production)
 * @param nonceConfig - TTL or nonce validation options
 */
export async function validateProofWithNonce(
    proof: unknown,
    nonceStore: NonceStore,
    nonceConfig: number | NonceValidationOptions = 300
): Promise<NonceValidationResult> {
    const opts: NonceValidationOptions = typeof nonceConfig === 'number'
        ? { nonceTtlSeconds: nonceConfig }
        : nonceConfig;
    const nonceTtlSeconds = opts.nonceTtlSeconds ?? 300;
    const markConsumed = opts.markConsumed ?? true;
    const telemetry = opts.telemetry;

    // First, run structural validation
    const structResult = validateProofStructure(proof);
    if (!structResult.valid) {
        return { ...structResult };
    }

    const p = proof as Record<string, unknown>;
    const nonce = opts.nonce ?? p['nonce'];

    if (typeof nonce === 'string' && nonce.length > 0) {
        if (markConsumed) {
            if (typeof nonceStore.consumeIfFresh === 'function') {
                const consumed = await nonceStore.consumeIfFresh(nonce, nonceTtlSeconds);
                if (!consumed) {
                    await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'atomic' });
                    return {
                        valid: false,
                        errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
                        isReplay: true,
                    };
                }
                await emitMetric(telemetry, 'eep.nonce.consumed_total', { component: 'nonce', mode: 'atomic' });
            } else {
                const replayed = await nonceStore.isConsumed(nonce);
                if (replayed) {
                    await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'legacy' });
                    return {
                        valid: false,
                        errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
                        isReplay: true,
                    };
                }
                await nonceStore.markConsumed(nonce, nonceTtlSeconds);
                await emitMetric(telemetry, 'eep.nonce.consumed_total', { component: 'nonce', mode: 'legacy' });
            }
        } else {
            const replayed = await nonceStore.isConsumed(nonce);
            if (replayed) {
                await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'check_only' });
                return {
                    valid: false,
                    errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
                    isReplay: true,
                };
            }
        }
    }

    return { valid: true, errors: [] };
}

export async function validateProofWithNonceAndVerifier(
    proof: unknown,
    nonceStore: NonceStore,
    semanticVerifier: (proof: Record<string, unknown>) => Promise<boolean>,
    nonceConfig: number | NonceValidationOptions = 300
): Promise<NonceValidationResult> {
    const opts: NonceValidationOptions = typeof nonceConfig === 'number'
        ? { nonceTtlSeconds: nonceConfig }
        : nonceConfig;
    const nonceTtlSeconds = opts.nonceTtlSeconds ?? 300;
    const telemetry = opts.telemetry;
    const shouldConsume = opts.markConsumed ?? true;

    const struct = validateProofStructure(proof);
    if (!struct.valid) return struct;

    const p = proof as Record<string, unknown>;
    const nonce = opts.nonce ?? p['nonce'];

    if (typeof nonce === 'string' && nonce.length > 0) {
        const replayed = await nonceStore.isConsumed(nonce);
        if (replayed) {
            await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'semantic_precheck' });
            return {
                valid: false,
                errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
                isReplay: true,
            };
        }
    }

    const semanticValid = await semanticVerifier(p);
    if (!semanticValid) {
        return {
            valid: false,
            errors: ['Semantic verification failed'],
        };
    }

    if (!shouldConsume || typeof nonce !== 'string' || nonce.length === 0) {
        return { valid: true, errors: [] };
    }

    if (typeof nonceStore.consumeIfFresh === 'function') {
        const consumed = await nonceStore.consumeIfFresh(nonce, nonceTtlSeconds);
        if (!consumed) {
            await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'semantic_atomic' });
            return {
                valid: false,
                errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
                isReplay: true,
            };
        }
        await emitMetric(telemetry, 'eep.nonce.consumed_total', { component: 'nonce', mode: 'semantic_atomic' });
        return { valid: true, errors: [] };
    }

    const replayed = await nonceStore.isConsumed(nonce);
    if (replayed) {
        await emitMetric(telemetry, 'eep.replay.detected_total', { component: 'nonce', mode: 'semantic_legacy' });
        return {
            valid: false,
            errors: [`Replay attack detected: nonce "${nonce}" has already been consumed`],
            isReplay: true,
        };
    }
    await nonceStore.markConsumed(nonce, nonceTtlSeconds);
    await emitMetric(telemetry, 'eep.nonce.consumed_total', { component: 'nonce', mode: 'semantic_legacy' });
    return { valid: true, errors: [] };
}


// ── G32: Payment Hash Consumed-Ledger (Double-Spend Prevention) ───────────────

/**
 * Interface for a payment-hash store that prevents double-spend attacks.
 *
 * When an agent submits a payment proof (on-chain tx hash or x402 payload hash),
 * the publisher MUST verify the hash has not been previously accepted. This prevents
 * an attacker from submitting a single valid payment to multiple gates simultaneously.
 *
 * Per Whitepaper §9.7:
 * "Publishers MUST also track seen x402_payload.payload hashes and reject duplicates
 *  within the transaction window (typically 5 minutes, matching on-chain confirmation time)."
 *
 * Per Whitepaper §9.7 (on-chain):
 * "The transaction has not been previously submitted as a proof (a publisher-side
 *  consumed-hash ledger prevents double-spend on the application layer)."
 *
 * @example Redis implementation:
 * ```typescript
 * class RedisPaymentHashStore implements PaymentHashStore {
 *   constructor(private redis: Redis) {}
 *
 *   async isSeen(txHash: string): Promise<boolean> {
 *     return (await this.redis.exists(`eep:payment:${txHash}`)) === 1;
 *   }
 *
 *   async markSeen(txHash: string, ttlSeconds: number): Promise<void> {
 *     await this.redis.set(`eep:payment:${txHash}`, '1', 'EX', ttlSeconds);
 *   }
 * }
 * ```
 */
export interface PaymentHashStore {
    /**
     * Check if a payment hash has already been accepted as a gate proof.
     * @param txHash - The on-chain transaction hash or x402 payload hash to check
     * @returns true if already seen (double-spend attempt), false if fresh
     */
    isSeen(txHash: string): Promise<boolean>;

    /**
     * Record a payment hash after successful acceptance.
     * MUST expire after ttlSeconds to prevent unbounded growth.
     *
     * @param txHash - The hash to record
     * @param ttlSeconds - Retention window. Should match the chain's finality window
     *                     (typically 300s for most chains, or 12 * avg_block_time)
     */
    markSeen(txHash: string, ttlSeconds: number): Promise<void>;

    /**
     * Atomically mark hash as seen only if it has not been seen before.
     * Returns true if newly consumed, false if already seen.
     * Implementations backed by Redis SHOULD prefer this method to avoid race conditions.
     */
    consumeIfFresh?(txHash: string, ttlSeconds: number): Promise<boolean>;
}

/**
 * In-memory payment hash store for testing and single-instance deployments.
 *
 * NOT suitable for production horizontally-scaled deployments.
 * Use a shared Redis-backed implementation in production.
 */
export class InMemoryPaymentHashStore implements PaymentHashStore {
    private seen = new Map<string, number>(); // txHash → expiry (unix ms)

    async isSeen(txHash: string): Promise<boolean> {
        const expiry = this.seen.get(txHash);
        if (expiry === undefined) return false;
        if (Date.now() > expiry) {
            this.seen.delete(txHash);
            return false;
        }
        return true;
    }

    async markSeen(txHash: string, ttlSeconds: number): Promise<void> {
        this.seen.set(txHash, Date.now() + ttlSeconds * 1000);
    }

    async consumeIfFresh(txHash: string, ttlSeconds: number): Promise<boolean> {
        const alreadySeen = await this.isSeen(txHash);
        if (alreadySeen) return false;
        await this.markSeen(txHash, ttlSeconds);
        return true;
    }

    /** Evict expired entries (call periodically in long-running processes) */
    evictExpired(): void {
        const now = Date.now();
        for (const [hash, expiry] of this.seen.entries()) {
            if (now > expiry) this.seen.delete(hash);
        }
    }

    /** Expose store size for testing */
    get size(): number { return this.seen.size; }
}

export interface PaymentDoubleSpendResult extends ProofValidationResult {
    /** true if this proof was rejected because the payment hash was already accepted */
    isDoubleSpend?: boolean;
    /** The tx hash that was checked */
    txHash?: string;
}

export interface PaymentDoubleSpendOptions {
    ttlSeconds?: number;
    telemetry?: SecurityTelemetryRecorder;
}

function resolvePaymentHash(proof: Record<string, unknown>): string | null {
    if (typeof proof.tx_hash === 'string' && proof.tx_hash.length > 0) {
        return proof.tx_hash;
    }

    // Legacy path kept for backward compatibility with older payload encoders.
    if (typeof proof.x402_payload === 'string' && proof.x402_payload.length > 0) {
        return proof.x402_payload;
    }

    if (typeof proof.x402_payload === 'object' && proof.x402_payload !== null) {
        const payload = (proof.x402_payload as Record<string, unknown>).payload;
        if (typeof payload === 'string' && payload.length > 0) {
            // Security spec requires deduping on x402_payload.payload hash.
            return createHash('sha256').update(payload, 'utf8').digest('hex');
        }
    }

    return null;
}

/**
 * Validate a payment proof against the consumed-hash ledger to prevent double-spend.
 *
 * This function handles both on-chain payment proofs (with `tx_hash` field) and
 * x402 payment payloads (with `x402_payload` field). Off-chain token proofs
 * (e.g., Stripe) that have no hash are passed through without ledger checks.
 *
 * Usage pattern for publishers:
 * ```typescript
 * // 1. Validate structure
 * const struct = validateProofStructure(proof);
 * if (!struct.valid) return struct;
 *
 * // 2. Validate chain (for on-chain payments)
 * const chain = validatePaymentChain(proof, paymentNetworks);
 * if (!chain.valid) return chain;
 *
 * // 3. Prevent double-spend (ALWAYS the last step — only after on-chain verification)
 * const doubleSpend = await validatePaymentProofForDoubleSpend(proof, hashStore);
 * if (!doubleSpend.valid) return doubleSpend;
 * ```
 *
 * @param proof - The proof object (must be type: 'payment')
 * @param hashStore - The PaymentHashStore implementation
 * @param ttlSeconds - How long to retain the seen hash (default: 300 = 5 minutes)
 */
export async function validatePaymentProofForDoubleSpend(
    proof: unknown,
    hashStore: PaymentHashStore,
    options: number | PaymentDoubleSpendOptions = 300
): Promise<PaymentDoubleSpendResult> {
    const ttlSeconds = typeof options === 'number' ? options : (options.ttlSeconds ?? 300);
    const telemetry = typeof options === 'number' ? undefined : options.telemetry;

    if (typeof proof !== 'object' || proof === null) {
        return { valid: false, errors: ['Proof must be an object'] };
    }

    const p = proof as Record<string, unknown>;

    // Only payment proofs have hash-based double-spend risk
    if (p.type !== 'payment') {
        return { valid: true, errors: [] };
    }

    // Determine which hash to check
    const txHash = resolvePaymentHash(p);
    if (!txHash && typeof p.token === 'string') {
        // Off-chain token (Stripe, etc.) — no hash ledger needed
        return { valid: true, errors: [] };
    }
    if (!txHash) {
        // No identifiable hash — structural error
        return {
            valid: false,
            errors: ['Payment proof must include tx_hash, x402_payload, or token'],
        };
    }

    // Prefer atomic consumed-ledger primitives in distributed deployments.
    if (typeof hashStore.consumeIfFresh === 'function') {
        const consumed = await hashStore.consumeIfFresh(txHash, ttlSeconds);
        if (!consumed) {
            await emitMetric(telemetry, 'eep.payment.double_spend_detected_total', { component: 'payment_hash', mode: 'atomic' });
            return {
                valid: false,
                errors: [
                    `Double-spend detected: payment hash "${txHash.slice(0, 16)}..." was already accepted`,
                ],
                isDoubleSpend: true,
                txHash,
            };
        }
        await emitMetric(telemetry, 'eep.payment.hash_consumed_total', { component: 'payment_hash', mode: 'atomic' });
        return { valid: true, errors: [], txHash };
    }

    // Legacy non-atomic path for stores that only support check-and-mark.
    const alreadySeen = await hashStore.isSeen(txHash);
    if (alreadySeen) {
        await emitMetric(telemetry, 'eep.payment.double_spend_detected_total', { component: 'payment_hash', mode: 'legacy' });
        return {
            valid: false,
            errors: [
                `Double-spend detected: payment hash "${txHash.slice(0, 16)}..." was already accepted`,
            ],
            isDoubleSpend: true,
            txHash,
        };
    }

    // Mark as seen — do this ONLY after on-chain verification is complete
    await hashStore.markSeen(txHash, ttlSeconds);
    await emitMetric(telemetry, 'eep.payment.hash_consumed_total', { component: 'payment_hash', mode: 'legacy' });

    return { valid: true, errors: [], txHash };
}

// ── Delegation privacy vs data_request (SPEC §11.8) ───────────────────────────

/**
 * Verify that a Delegation Proof credentialSubject permits a publisher's data_request gate:
 * policy hash alignment (when both sides declare hashes) and DPV purpose / retention bounds.
 */
export function delegationPermitsDataRequest(
    subject: DelegationCredentialSubject,
    requirement: DataRequestRequirement,
): ProofValidationResult {
    const errors: string[] = [];

    if (requirement.policy_hash && subject.operator_privacy_policy_hash) {
        if (requirement.policy_hash !== subject.operator_privacy_policy_hash) {
            errors.push(
                'data_request policy_hash does not match delegation operator_privacy_policy_hash',
            );
        }
    }

    const allowed = subject.allowed_dpv_purposes;
    if (allowed && allowed.length > 0) {
        for (const c of requirement.requested_claims) {
            if (!allowed.includes(c.purpose)) {
                errors.push(`DPV purpose ${c.purpose} is not in delegation allowed_dpv_purposes`);
            }
        }
    }

    if (subject.max_retention_days !== undefined) {
        for (const c of requirement.requested_claims) {
            if (c.retention_days > subject.max_retention_days) {
                errors.push(
                    `claim ${c.claim} retention_days ${c.retention_days} exceeds delegation max_retention_days ${subject.max_retention_days}`,
                );
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
