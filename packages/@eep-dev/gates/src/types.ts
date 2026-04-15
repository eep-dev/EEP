/**
 * @eep-dev/gates — Types
 *
 * Core TypeScript interfaces for the EEP Gates system.
 * Entity-defined tiers with extensible requirement types.
 */

// ── Requirement Types ─────────────────────────────────────────────────────────

/** Standard requirement type identifiers */
export type StandardRequirementType =
    | 'payment'
    | 'trust'
    | 'identity'
    | 'connection'
    | 'credential'
    | 'capability'
    | 'allowlist'
    | 'reciprocal'
    | 'data_request'
    | 'agreement'
    | 'combined'
    | 'standard_residency'
    | 'proof_of_intent';

/** Custom requirement types use x- prefix */
export type CustomRequirementType = `x-${string}`;

export type RequirementType = StandardRequirementType | CustomRequirementType;

/** Base requirement — all requirements have at least a type */
export interface BaseRequirement {
    type: RequirementType;
}

/** x402 payment rail configuration (https://x402.org) */
export interface X402Config {
    enabled: boolean;
    facilitator_url?: string;   // x402 facilitator endpoint
    payment_rails?: ('x402/usdc' | 'x402/eth' | string)[];
    network?: 'base' | 'ethereum' | 'polygon' | string;
}

export interface PaymentRequirement extends BaseRequirement {
    type: 'payment';
    amount: number;
    currency: string;
    per: 'request' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'once';
    payment_methods?: string[];
    /** Native x402 protocol integration (ref27) */
    x402?: X402Config;
}

export interface TrustRequirement extends BaseRequirement {
    type: 'trust';
    min_score: number;
}

export interface IdentityRequirement extends BaseRequirement {
    type: 'identity';
    method: 'did_verified' | 'email_verified' | 'domain_verified' | 'kyc' | 'any';
}

export interface ConnectionRequirement extends BaseRequirement {
    type: 'connection';
    relation: 'follower' | 'following' | 'mutual' | 'any';
}

export interface CredentialRequirement extends BaseRequirement {
    type: 'credential';
    credential_type: string;
    issuer?: string;
    accepted_formats?: ('jwt_vc' | 'ldp_vc' | 'sd_jwt_vc')[];
}

export interface CapabilityRequirement extends BaseRequirement {
    type: 'capability';
    required_capabilities: string[];
}

export interface AllowlistRequirement extends BaseRequirement {
    type: 'allowlist';
    dids: string[];
}

export interface ReciprocalRequirement extends BaseRequirement {
    type: 'reciprocal';
    access_level: string;
}

export interface CustomRequirement extends BaseRequirement {
    type: CustomRequirementType;
    [key: string]: unknown;
}

/** W3C DPV claim request with purpose declaration */
export interface DataRequestClaim {
    claim: string;           // Specific claim identifier (e.g. org_type)
    purpose: string;         // dpv:* URI (W3C DPV vocabulary)
    retention_days: number;  // Days publisher will retain — binding commitment
    shareable?: boolean;     // Whether publisher may share with third parties
}

/** data_request gate: quid-pro-quo data exchange (§7, Whitepaper) */
export interface DataRequestRequirement extends BaseRequirement {
    type: 'data_request';
    requested_claims: DataRequestClaim[];
    policy_url?: string;     // URL to privacy policy document
    policy_hash?: string;    // sha256:hex of policy document
}

/** agreement gate: EdDSA cryptographic license signing (§7, Whitepaper) */
export interface AgreementRequirement extends BaseRequirement {
    type: 'agreement';
    document_hash: string;   // sha256:hex of the license document
    document_url: string;    // URL to fetch the agreement document
    document_title?: string; // Human-readable title
    signature_algo?: 'EdDSA' | 'ES256K'; // Default: EdDSA
}

/** combined gate: AND/OR bundle of nested requirements (atomic verification) */
export interface CombinedRequirement extends BaseRequirement {
    type: 'combined';
    combine_mode: 'all' | 'any';
    requirements: Requirement[];
    /** Optional hint for proof collection order (e.g. agreement before payment) */
    recommended_collection_order?: string[];
}

/** standard_residency gate: Data sovereignty & geo-fencing (EU AI Act) */
export interface ResidencyRequirement extends BaseRequirement {
    type: 'standard_residency';
    allowed_countries?: string[];    // ISO 3166-1 alpha-2 (e.g. ['EE', 'DE', 'FR'])
    blocked_countries?: string[];    // e.g. ['US', 'CN', 'RU']
    enforcement_layer: 'network_ip' | 'did_attestation' | 'both';
}

export type Requirement =
    | PaymentRequirement
    | TrustRequirement
    | IdentityRequirement
    | ConnectionRequirement
    | CredentialRequirement
    | CapabilityRequirement
    | AllowlistRequirement
    | ReciprocalRequirement
    | DataRequestRequirement
    | AgreementRequirement
    | CombinedRequirement
    | ResidencyRequirement
    | CustomRequirement;

// ── Rate Limits ───────────────────────────────────────────────────────────────

export interface RateLimit {
    requests_per_minute?: number;
    requests_per_hour?: number;
    requests_per_day?: number;
    concurrent_connections?: number;
}

// ── Tiers ─────────────────────────────────────────────────────────────────────

export interface Tier {
    label?: string;
    description?: string;
    requirements: Requirement[];
    access: string[];
    rate_limit?: RateLimit;
    metadata?: Record<string, unknown>;
}

// ── Gate Configuration ────────────────────────────────────────────────────────

export interface GateConfig {
    default_tier: string;
    tiers: Record<string, Tier>;
    fallback_behavior?: 'restrict' | 'default';
}

// ── Proofs ────────────────────────────────────────────────────────────────────

export interface BaseProof {
    type: RequirementType;
    issued_at?: string;
    expires_at?: string;
    nonce?: string;
}

/** x402 EIP-712 payment payload */
export interface X402Payload {
    payload: string;       // EIP-712 PaymentPayload JSON string
    signature: string;     // Hex-encoded secp256k1 signature
    network: string;       // e.g. 'base', 'ethereum'
    settlement_tx?: string; // On-chain tx hash after settlement
}

export interface PaymentProof extends BaseProof {
    type: 'payment';
    token: string;
    provider?: string;
    tier?: string;
    /** x402 native payment proof — use instead of token for x402 rails */
    x402_payload?: X402Payload;
}

export interface TrustProof extends BaseProof {
    type: 'trust';
    self_attested: true;
}

export interface IdentityProof extends BaseProof {
    type: 'identity';
    method: string;
    evidence?: string;
}

export interface ConnectionProof extends BaseProof {
    type: 'connection';
    subscriber_did: string;
    relation?: string;
}

export interface CredentialProof extends BaseProof {
    type: 'credential';
    credential: string;
    format: 'jwt_vc' | 'ldp_vc' | 'sd_jwt_vc';
}

export interface CapabilityProof extends BaseProof {
    type: 'capability';
    declared_capabilities: string[];
}

export interface AllowlistProof extends BaseProof {
    type: 'allowlist';
    did: string;
}

export interface ReciprocalProof extends BaseProof {
    type: 'reciprocal';
    entity_did: string;
    granted_access: string;
}

/** data_request proof: signed Verifiable Presentation */
export interface DataRequestProof extends BaseProof {
    type: 'data_request';
    verifiable_presentation: string;  // JWT VP or JSON-LD string
    claimed_fields?: string[];        // Claim keys included in VP
}

/** agreement proof: EdDSA signature over license document hash */
export interface AgreementProof extends BaseProof {
    type: 'agreement';
    document_hash: string;   // sha256:hex — must match requirement
    signature: string;       // EdDSA/ES256K signature over document_hash
    signer_did: string;      // DID of the signing agent
    signature_algo?: 'EdDSA' | 'ES256K';
}

/** signed location attestation for strict residency zones */
export interface ResidencyProof extends BaseProof {
    type: 'standard_residency';
    location_vc: string;     // W3C VC attesting to agent's legal jurisdiction
    country_code: string;    // ISO 3166-1 alpha-2
}

export type GateProof =
    | PaymentProof
    | TrustProof
    | IdentityProof
    | ConnectionProof
    | CredentialProof
    | CapabilityProof
    | AllowlistProof
    | ReciprocalProof
    | ProofOfIntent        // G4: Proof-of-Intent
    | DataRequestProof     // G13: data_request gate
    | AgreementProof       // G14: agreement gate
    | ResidencyProof       // G40: standard_residency gate
    | BaseProof;           // Catch-all for custom x- types

// ── Access Resolution ─────────────────────────────────────────────────────────

export interface UnmetRequirement {
    type: RequirementType;
    resolution_hint?: string;
    [key: string]: unknown;
}

export interface AccessResult {
    granted: boolean;
    tier: string;
    unmet: UnmetRequirement[];
}

// ── HTTP 402 Response ─────────────────────────────────────────────────────────

export interface AccessRestrictionResponse {
    error: 'access_restricted';
    resource: string;
    current_tier: string;
    required_tier: string;
    unmet_requirements: UnmetRequirement[];
    available_tiers?: Record<string, Pick<Tier, 'label' | 'description' | 'requirements' | 'access'>>;
    gates_config_url?: string;
    retry_after?: number;
}

// ── 403 Forbidden Response ───────────────────────────────────────────────────

/** HTTP 403 response for credential/agreement/identity gate failure (G6) */
export interface ForbiddenResponse {
    error: 'access_forbidden';
    resource: string;
    current_tier: string;
    required_tier: string;
    unmet_requirements: UnmetRequirement[];
    gates_config_url?: string;
}

/** HTTP 451 response for legally restricted resources (G6) */
export interface LegallyRestrictedResponse {
    error: 'legally_restricted';
    resource: string;
    reason: string;          // Human-readable legal reason
    legal_basis?: string;    // e.g. 'EU AI Act Art. 6', 'DORA'
    jurisdiction?: string;   // e.g. 'EU', 'US'
    contact?: string;        // Contact for legal queries
}

// ── Proof-of-Intent (PoI) — G4 ───────────────────────────────────────────────

/** Intent document signed by human principal or HSM */
export interface IntentDocument {
    intent_id: string;
    agent_did: string;                  // DID of the acting agent
    principal_did: string;              // DID of the human/hardware principal
    action: string;                     // Human-readable action description
    scope: {
        max_amount?: number;            // Max spend allowed (commerce)
        currency?: string;
        allowed_resources?: string[];   // Glob patterns agent may access
        expires_at: string;             // ISO8601 hard expiry
    };
    principal_signature: string;        // Ed25519/secp256k1 sig over intent_id + scope hash
    created_at: string;
}

export interface ProofOfIntent extends BaseProof {
    type: 'proof_of_intent';
    intent_document: IntentDocument;
}

// ── EEP Manifest — G3/G8 ─────────────────────────────────────────────────────

/** ERC-8004 on-chain reputation binding */
export interface ERC8004Reputation {
    contract: string;       // ERC-721 contract address
    chain: string;          // e.g. 'ethereum', 'base'
    scan_url?: string;      // 8004Scan URL for this agent
}

/** Full /.well-known/eep.json manifest */
export interface EEPManifest {
    did: string;
    eep_version: string;
    layers: {
        layer1: string;          // REST state endpoint
        layer2_sse?: string;     // SSE stream URL
        layer2_webhook?: string; // Webhook subscription URL
        layer3_ws?: string;      // WebSocket pulse URL
    };
    supported_content_types: string[];
    gates_url?: string;
    services_url?: string;
    /** ERC-8004 on-chain reputation (ref28) */
    reputation?: ERC8004Reputation;
    /** Post-Quantum Cryptography readiness (ref26) */
    pqc_ready: boolean;
    pqc_algorithms?: string[];  // e.g. ['ML-KEM-768', 'ML-DSA-65']
    /** x402 payment rail support (ref27) */
    x402_enabled: boolean;
    x402?: Pick<X402Config, 'facilitator_url' | 'payment_rails' | 'network'>;
    /** Dynamic capability discovery */
    capabilities_query_url?: string;
    /** Regulatory compliance flags */
    compliance?: {
        eu_ai_act?: boolean;
        gdpr?: boolean;
        anp_compatible?: boolean;
        dpv_purpose?: string;
        dpv_retention?: string;
    };
    updated_at?: string;
}

// ── Dynamic Capability Discovery — G5 ────────────────────────────────────────

export interface CapabilityQuery {
    query?: string;       // Freetext semantic search
    category?: string;
    gate_type?: RequirementType;
    page?: number;
    limit?: number;       // Max 50
}

export interface CapabilityItem {
    id: string;
    name: string;
    description?: string;
    category: string;
    gate_types: RequirementType[];
    access_patterns: string[];
}

export interface CapabilityPage {
    items: CapabilityItem[];
    total: number;
    page: number;
    limit: number;
    next_page_url?: string;
}

// ── Commerce ──────────────────────────────────────────────────────────────────

export type PricingModel =
    | 'fixed'
    | 'per_request'
    | 'per_event'
    | 'subscription'
    | 'metered'
    | 'tiered_volume'
    | `x-${string}`;

export interface Pricing {
    model: PricingModel;
    amount?: number;
    currency: string;
    period?: 'hour' | 'day' | 'week' | 'month' | 'year';
    unit?: string;
    rate?: number;
    tiers?: Array<{ up_to: number | 'infinity'; rate: number }>;
    minimum_charge?: number;
    maximum_charge?: number;
}

export type NegotiationStatus =
    | 'open'
    | 'countered'
    | 'accepted'
    | 'rejected'
    | 'expired'
    | 'invoiced'
    | 'paid'
    | 'completed'
    | 'disputed';

export type CommerceAction =
    | 'offer'
    | 'counter'
    | 'accept'
    | 'reject'
    | 'expire'
    | 'invoice'
    | 'receipt'
    | 'complete'
    | 'dispute';

export interface NegotiationEnvelope {
    negotiation_id: string;
    service: string;
    pricing?: Pricing;
    terms?: {
        delivery?: string;
        expires_in?: number;
        conditions?: string[];
        cancellation_policy?: string;
        sla?: Record<string, unknown>;
    };
    reason?: string;
    invoice?: {
        invoice_id: string;
        amount: number;
        currency: string;
        line_items?: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
        payment_methods?: string[];
        due_by?: string;
    };
    receipt?: {
        receipt_id: string;
        invoice_id?: string;
        payment_proof: { type: string; token: string; provider?: string };
        paid_at?: string;
    };
    metadata?: Record<string, unknown>;
}

// ── Service Listing ───────────────────────────────────────────────────────────

export interface ServiceListing {
    id: string;
    name: string;
    description?: string;
    category: string;
    tags?: string[];
    pricing: Pricing;
    availability?: {
        type: 'always' | 'schedule' | 'on_demand' | 'limited';
        timezone?: string;
        schedule?: Record<string, Array<{ start: string; end: string }>>;
        slots_remaining?: number;
        next_available?: string;
    };
    delivery: string;
    gate_requirements?: Requirement[];
    negotiable?: boolean;
    rating?: { score: number; count: number };
    status?: 'active' | 'paused' | 'sold_out' | 'coming_soon';
    created_at?: string;
    updated_at?: string;
    metadata?: Record<string, unknown>;
}

export interface ServiceCatalog {
    entity_did: string;
    services: ServiceListing[];
}

export interface Review {
    id?: string;
    reviewer_did: string;
    score: number;
    comment?: string;
    service_id: string;
    created_at?: string;
}

// ── Session Token — G15 ───────────────────────────────────────────────────────

/** Session token issued after gate satisfaction (§6, Whitepaper) */
export interface SessionToken {
    agent_did: string;          // DID of the agent this token is bound to
    issuer_did: string;         // DID of the publisher that issued the token
    tiers: string[];            // Gate tiers granted
    iat: number;                // Issued-at (UNIX seconds)
    exp: number;                // Expiry (UNIX seconds)
    refresh_threshold?: number; // Proactive renewal threshold (UNIX seconds)
    context_id?: string;        // Opaque context for resuming operations
    gate_version?: string;      // Gate config version at issuance
    signature: string;          // EdDSA signature (base64url)
}

// ── Delegation Proof VC — G16 ─────────────────────────────────────────────────

/** Credential subject of a Delegation Proof VC */
export interface DelegationCredentialSubject {
    id: string;                        // DID of the delegate (agent)
    permitted_actions: string[];       // Explicit action allowlist
    permitted_endpoints?: string[];    // URL glob patterns allowed
    max_payment_amount?: number;       // Maximum payment authorization
    currency_code?: string;            // ISO 4217 currency for max_payment_amount
    scope_hash?: string;               // sha256:hex tamper-detection hash
    /** Binds sub-agent to operator privacy policy (SPEC §11.8) */
    operator_privacy_policy_hash?: string;
    /** DPV purposes the delegate may use in data_request VPs */
    allowed_dpv_purposes?: string[];
    max_retention_days?: number;
}

/** W3C VC Delegation Proof (§13 Agent Delegation Chains, Whitepaper) */
export interface DelegationProof {
    '@context': string[];
    type: string[];                         // Must include 'EEPDelegationProof'
    issuer: string;                         // Owner DID
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: DelegationCredentialSubject;
    proof: {
        type: string;
        created?: string;
        verificationMethod: string;
        proofPurpose?: string;
        proofValue: string;
    };
}

// ── Operator Policy Profiles — G18 ───────────────────────────────────────────

/** Agent's standing data-sharing policy (§7.4, Whitepaper) */
export interface OperatorPrivacyPolicy {
    operator_did: string;
    version: string;
    issued_at: string;
    freely_shareable_claims?: string[];
    human_confirmation_required?: string[];
    unconditionally_refused?: string[];
    max_retention_days?: number;
    allow_unverified_publishers?: boolean;
    dpv_purposes_allowed?: string[];
    operator_signature?: string;
}

/** Agent's payment constraint policy (§8.4, Whitepaper) */
export interface OperatorSpendingPolicy {
    operator_did: string;
    version: string;
    issued_at: string;
    max_per_transaction?: Record<string, number>;  // currency -> amount
    max_per_hour?: Record<string, number>;
    max_per_day?: Record<string, number>;
    approved_chains?: string[];
    approved_recipient_categories?: string[];
    /** Per Whitepaper §10.2: three tiers only — Core, Standard, Full. */
    require_recipient_conformance_level?: 'Core' | 'Standard' | 'Full';
    require_on_chain_confirmation?: boolean;
    operator_signature?: string;
}

// ── Auction / RFP Pricing — G19 ──────────────────────────────────────────────

/** Auction configuration for manifest pricing_mode: auction */
export interface AuctionConfig {
    mechanism: 'first_price' | 'vickrey' | 'reverse';
    close_time: string;    // ISO 8601 datetime
    reserve_price?: number;
    currency: string;
}

/** Allocation Receipt VC issued to auction winner */
export interface AllocationReceipt {
    '@context': string[];
    type: string[];         // Must include 'EEPAllocationReceipt'
    issuer: string;         // Publisher DID
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: {
        id: string;                // Winner agent DID
        allocation_id: string;
        winning_bid: number;
        currency: string;
        service_id?: string;
        valid_from: string;
        valid_until?: string;
    };
    proof: {
        type: string;
        verificationMethod: string;
        proofValue: string;
    };
}

/** pricing_mode values — G19 */
export type PricingMode = 'fixed' | 'negotiable' | 'auction';

// ── Registry Federation — G20 ─────────────────────────────────────────────────

/** /.well-known/eep-registry.json manifest structure */
export interface EEPRegistryManifest {
    did: string;
    registry_name: string;
    registry_url?: string;
    scope: {
        geography?: string[];
        sectors?: string[];
        capabilities?: string[];
    };
    trust_criteria?: {
        did_verification?: boolean;
        manifest_consistency_check?: boolean;
        additional_checks?: string[];
    };
    /** Per Whitepaper §10.2: three tiers only — Core, Standard, Full. */
    conformance_tier_required: 'Core' | 'Standard' | 'Full';
    federation_credential_url: string;
    cross_registry_resolution_url?: string;
    eep_version?: string;
    updated_at?: string;
}

// ── G24: EEP Request Headers ──────────────────────────────────────────────────

/** Mandatory EEP HTTP request headers per Whitepaper §7 / SPECIFICATION.md §3.1.2 */
export interface EEPRequestHeaders {
    'EEP-Agent-DID'?: string;
    'EEP-Signature'?: string;
    'EEP-Nonce'?: string;
    'EEP-Version'?: string;
    'EEP-Session'?: string;
    'X-EEP-RL-Challenge'?: string;
    [key: string]: string | undefined;
}

// ── G25: session.revoked Event ────────────────────────────────────────────────

/** Published over WebSocket/SSE when a publisher revokes an agent session in real time */
export interface SessionRevokedEvent {
    session_id: string;
    agent_did: string;
    publisher_did?: string;
    reason: 'agreement_violation' | 'payment_failed' | 'operator_request' | 'security_incident' | 'session_expired' | string;
    revoked_at: string;
    re_auth_required?: boolean;
}

// ── G28: commerce.rfp.* Events ────────────────────────────────────────────────

/** Publisher opens a Request-for-Proposals auction */
export interface RFPOpenEvent {
    rfp_id: string;
    publisher_did: string;
    description: string;
    mechanism: 'first_price' | 'vickrey' | 'reverse';
    close_time: string;
    reserve_price?: number;
    currency?: string;
    manifest_hash?: string;
}

/** Agent submits a bid on an open RFP */
export interface RFPBidEvent {
    rfp_id: string;
    bidder_did: string;
    bid_amount: number;
    bid_currency: string;
    signed_bid: string;
}

/** Publisher closes auction and announces winner with AllocationReceipt VC */
export interface RFPClosedEvent {
    rfp_id: string;
    winner_did: string;
    winning_bid: number;
    total_bids?: number;
    closed_at: string;
    allocation_receipt_vc: AllocationReceipt;
}

// ── G30: Rate-Limit 429 Response ─────────────────────────────────────────────

/** HTTP 429 Too Many Requests response body per Whitepaper §10.5 / SPECIFICATION.md §3.4.6 */
export interface RateLimitResponse {
    error: 'rate_limited';
    did_rate_limit_key: string;
    retry_after_seconds: number;
    window_reset_at: string;
    signed_challenge: string;
    limit_per_window?: number;
    requests_made?: number;
    message?: string;
}

// ── G26: Agent Wallet / DID Binding ──────────────────────────────────────────

export type WalletBindingModel = 'operator_derived' | 'hardware_isolated' | 'os_keychain';

export interface WalletRotationPolicy {
    max_age_days: number;
    auto_rotate?: boolean;
    next_rotation_at?: string;
}

export interface WalletDelegationScope {
    master_did: string;
    delegation_credential_id?: string;
    permitted_gate_types: StandardRequirementType[];
    permitted_endpoints?: string[];
    max_payment_amount_usd: number;
    expires_at: string;
}

/** Agent Wallet Binding Declaration per Whitepaper §8 / schemas/v0.1/agent.wallet.json */
export interface AgentWallet {
    agent_did: string;
    binding_model: WalletBindingModel;
    key_type: 'Ed25519' | 'secp256k1' | 'P-256' | 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';
    created_at: string;
    rotation_policy: WalletRotationPolicy;
    delegation_scope?: WalletDelegationScope;
    operator_derived_config?: {
        derivation_path: string;
        master_did?: string;
    };
    hardware_config?: {
        hardware_type?: 'tpm_2.0' | 'aws_nitro_enclaves' | 'azure_confidential_computing' | 'gcp_confidential_vm' | 'hsm_pkcs11' | 'sgx' | 'trustzone';
        attestation_endpoint?: string;
    };
    os_keychain_config?: {
        platform?: 'apple_secure_enclave' | 'android_keystore' | 'windows_cng' | 'linux_tpm';
        biometric_required?: boolean;
    };
    operator_did?: string;
    pqc_ready?: boolean;
}

// ── G32: Payment Hash Ledger Types ────────────────────────────────────────────

/** Entry in the publisher-side payment hash consumed ledger (Whitepaper §9.7) */
export interface PaymentHashEntry {
    /** The on-chain tx_hash or x402 payload hash that was accepted */
    txHash: string;
    /** Unix timestamp (ms) when this hash was first accepted */
    acceptedAt: number;
    /** Unix timestamp (ms) when this entry expires from the ledger */
    expiresAt: number;
    /** The DID of the agent whose payment proof this was */
    agentDid?: string;
    /** The amount in USD-equivalent, for audit purposes */
    amountUsd?: number;
}

// ── G33: WebSocket / SSE Close Codes ─────────────────────────────────────────

/**
 * EEP-defined WebSocket and SSE close codes (Whitepaper §9.6).
 *
 * When a publisher SSE/WS subscriber falls too far behind the event stream,
 * the connection MUST be gracefully terminated with code 4000 (BACKPRESSURE)
 * rather than buffering indefinitely — preventing memory exhaustion attacks
 * from slow consumers.
 *
 * @example Publisher-side SSE backpressure check (Node.js):
 * ```typescript
 * const LAG_THRESHOLD = 1000; // events
 * if (subscriber.lag > LAG_THRESHOLD) {
 *   subscriber.close(WsCloseCode.BACKPRESSURE, 'Subscriber too far behind event stream');
 * }
 * ```
 */
export enum WsCloseCode {
    /**
     * 4000 — Backpressure: subscriber is too far behind the event stream.
     * Publisher MUST use this code when terminating slow SSE/WS consumers.
     * The agent should reconnect with Last-Event-ID to replay missed events.
     */
    BACKPRESSURE = 4000,

    /**
     * 4001 — Session revoked: publisher has revoked the agent's session.
     * Agent MUST re-authenticate before reconnecting.
     */
    SESSION_REVOKED = 4001,

    /**
     * 4002 — Rate limited: agent has exceeded its DID-based rate limit.
     * Agent MUST wait for the Retry-After period before reconnecting.
     */
    RATE_LIMITED = 4002,

    /**
     * 4003 — Proof expired: the session token or gate proof has expired.
     * Agent MUST re-satisfy gate requirements before reconnecting.
     */
    PROOF_EXPIRED = 4003,

    /**
     * 4004 — Version mismatch: agent sent an incompatible EEP version.
     * Agent MUST perform version negotiation before reconnecting.
     */
    VERSION_MISMATCH = 4004,
}

/** Number of events behind the stream before a publisher MUST apply backpressure */
export const SSE_BACKPRESSURE_THRESHOLD_EVENTS = 1000;

/** Maximum reconnection lag window in seconds before backpressure is applied */
export const SSE_BACKPRESSURE_LAG_SECONDS = 300;

