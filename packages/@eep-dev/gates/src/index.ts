/**
 * @eep-dev/gates
 *
 * General-purpose access control, commerce negotiation, and service discovery for EEP.
 *
 * The protocol defines requirement TYPES, not VALUES. Entity owners fully
 * customize their tiers, requirements, and pricing. This library provides
 * the structural validation and logic; semantic verification (e.g., verifying
 * a Stripe payment or a Verifiable Credential) is delegated to platform-specific
 * ProofVerifier implementations.
 *
 * @example
 * ```typescript
 * import { parseGateConfig, resolveAccess, build402Response, ProofVerifierRegistry } from '@eep-dev/gates';
 *
 * const config = parseGateConfig(entityGateJson);
 * const registry = new ProofVerifierRegistry();
 * registry.register({
 *   supportedTypes: ['payment'],
 *   verify: async (proof) => Boolean((proof as { token?: string }).token),
 * });
 * const result = await resolveAccess(agentProofs, config, 'content.papers.full_text', registry);
 *
 * if (!result.granted) {
 *   const response = await build402Response(config, 'content.papers.full_text', agentProofs);
 *   return c.json(response, 402);
 * }
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
    // ── Core requirement types (whitepaper Table 2: 6 standard gate types) ──────
    RequirementType, StandardRequirementType, CustomRequirementType,
    BaseRequirement,
    // Standard: credential, identity, agreement, data_request, payment, combined
    CredentialRequirement, IdentityRequirement, Requirement, CombinedRequirement,
    // G13: data_request gate
    DataRequestClaim, DataRequestRequirement, DataRequestProof,
    // G14: agreement gate
    AgreementRequirement, AgreementProof,
    // G40: Residency/Geofencing
    ResidencyRequirement, ResidencyProof,
    // combined is expressed as Requirement (AND/OR of any above)
    PaymentRequirement,

    // ── Extension requirement types (not in whitepaper core; implementation extras)
    // These may be useful in platform-specific implementations but are NOT
    // required for whitepaper conformance.
    TrustRequirement, ConnectionRequirement, CapabilityRequirement,
    AllowlistRequirement, ReciprocalRequirement, CustomRequirement,

    // Gate config
    Tier, RateLimit, GateConfig,
    // Proofs
    BaseProof, PaymentProof, TrustProof, IdentityProof, ConnectionProof,
    CredentialProof, CapabilityProof, AllowlistProof, ReciprocalProof, GateProof,
    // x402 (G2)
    X402Config, X402Payload,
    // Proof-of-Intent (G4)
    IntentDocument, ProofOfIntent,
    // Access results
    UnmetRequirement, AccessResult, AccessRestrictionResponse,
    // HTTP 403/451 (G6)
    ForbiddenResponse, LegallyRestrictedResponse,
    // EEP Manifest & ERC-8004 (G3/G8)
    EEPManifest, ERC8004Reputation,
    // Dynamic Capability Discovery (G5)
    CapabilityQuery, CapabilityItem, CapabilityPage,
    // G15: Session Token
    SessionToken,
    // G16: Delegation Proof VC
    DelegationCredentialSubject, DelegationProof,
    // G18: Operator Policy Profiles
    OperatorPrivacyPolicy, OperatorSpendingPolicy,
    // G19: Auction / RFP
    AuctionConfig, AllocationReceipt, PricingMode,
    // G20: Registry Federation
    EEPRegistryManifest,
    // Commerce
    PricingModel, Pricing, NegotiationStatus, CommerceAction, NegotiationEnvelope,
    // Service listing
    ServiceListing, ServiceCatalog, Review,
    // G24: EEP Request Headers
    EEPRequestHeaders,
    // G25: session.revoked
    SessionRevokedEvent,
    // G26: Agent Wallet
    AgentWallet, WalletBindingModel, WalletRotationPolicy, WalletDelegationScope,
    // G28: commerce.rfp.* events
    RFPOpenEvent, RFPBidEvent, RFPClosedEvent,
    // G30: Rate-limit 429
    RateLimitResponse,
    // G32: Payment hash ledger
    PaymentHashEntry,
    // G33: WebSocket / SSE close codes
    WsCloseCode,
    SSE_BACKPRESSURE_THRESHOLD_EVENTS, SSE_BACKPRESSURE_LAG_SECONDS,
} from './types.js';

// ── Gate Config ───────────────────────────────────────────────────────────────
export { parseGateConfig, serializeGateConfig, getUsedRequirementTypes, GateConfigError } from './gate-config.js';

// ── Resource Matching ─────────────────────────────────────────────────────────
export { matchResource, matchesAny, findTiersForResource, patternSpecificity, bestSpecificityFor } from './resource-matcher.js';

// ── Access Resolution ─────────────────────────────────────────────────────────
export { resolveAccess, defaultTierOverriddenByGatedTier, type ResolveAccessOptions } from './access-resolver.js';

// ── Proof Validation ──────────────────────────────────────────────────────────
export {
    validateProofStructure, validateProofs,
    delegationPermitsDataRequest,
    ProofVerifierRegistry,
    type ProofVerifier, type ProofValidationResult,
    // G24: Request header validation
    validateRequestHeaders,
    type HeaderValidationResult,
    // G27: Multi-chain payment proof validation
    validatePaymentChain,
    type DeclaredPaymentNetwork, type PaymentChainValidationResult,
    // G29: Nonce consumed-ledger
    InMemoryNonceStore, validateProofWithNonce,
    validateProofWithNonceAndVerifier,
    type NonceStore, type NonceValidationResult, type NonceValidationOptions,
    // G32: Payment hash consumed-ledger (double-spend prevention)
    InMemoryPaymentHashStore, validatePaymentProofForDoubleSpend,
    type PaymentHashStore, type PaymentDoubleSpendResult, type PaymentDoubleSpendOptions,
    // Security telemetry
    CRITICAL_SECURITY_METRICS,
    setGlobalSecurityTelemetryRecorder, getGlobalSecurityTelemetryRecorder,
    type SecurityMetricName, type SecurityTelemetryRecorder,
} from './proof-validator.js';

// ── Redis-backed stores (distributed deployments) ─────────────────────────────
export {
    RedisNonceStore, RedisPaymentHashStore,
    type RedisClientLike,
} from './redis-stores.js';

// ── Proof-of-Intent Validator (G4) ────────────────────────────────────────────
export {
    validateIntentDocument, isWithinScope, validatePoIProof,
} from './poi-validator.js';

// ── HTTP 402 ──────────────────────────────────────────────────────────────────
export { build402Response, isGatedResource, build429Response } from './http-402.js';

// ── Commerce ──────────────────────────────────────────────────────────────────
export {
    transition, getValidActions, isTerminal,
    validatePricing, validateNegotiationEnvelope,
    type TransitionResult, type PricingValidationResult,
} from './commerce.js';

// ── Service Listing ───────────────────────────────────────────────────────────
export {
    validateServiceListing, validateServiceCatalog, validateReview,
    type ValidationResult,
} from './service-listing.js';

