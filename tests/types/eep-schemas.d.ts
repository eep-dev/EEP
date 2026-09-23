/* eslint-disable */
// AUTO-GENERATED FROM schemas/v0.1/*.json — DO NOT EDIT BY HAND.
// Run `node scripts/codegen-schema-types.mjs` to regenerate.
// CI fails if this file drifts from the schemas.

// ────────────────────────────────────────────────────────
// agent.wallet.json
// ────────────────────────────────────────────────────────
/**
 * Schema for the Agent Wallet Binding Declaration — a signed document declaring how an agent's operational DID is bound to its cryptographic key store. Three binding models are defined per Whitepaper §8: operator-derived (BIP-32 HD), hardware-isolated (TEE/HSM), and OS-keychain (Secure Enclave / Android Keystore / Windows CNG). This document is stored in the agent's local secure configuration and can be presented to publishers requiring it.
 */
export interface EEPAgentWalletBindingDeclaration {
  /**
   * The operational DID derived from this wallet. This is the identity the agent uses in all EEP interactions.
   */
  agent_did: string;
  /**
   * The key binding model. 'operator_derived' = BIP-32 HD derivation from operator master seed. 'hardware_isolated' = TEE/HSM-bound key, never extractable. 'os_keychain' = OS Secure Enclave / Keystore / CNG.
   */
  binding_model: 'operator_derived' | 'hardware_isolated' | 'os_keychain';
  /**
   * The cryptographic key type used for this wallet's DID private key.
   */
  key_type: 'Ed25519' | 'secp256k1' | 'P-256' | 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';
  /**
   * ISO 8601 UTC timestamp when this wallet binding was created.
   */
  created_at: string;
  /**
   * Key rotation policy. EEP recommends 90-day proactive rotation.
   */
  rotation_policy: {
    /**
     * Maximum key age in days before rotation is required. Recommended: 90.
     */
    max_age_days: number;
    /**
     * If true, the agent automatically rotates the key when max_age_days is reached without human confirmation.
     */
    auto_rotate?: boolean;
    /**
     * ISO 8601 UTC timestamp of the next scheduled rotation (informational).
     */
    next_rotation_at?: string;
  };
  /**
   * If this is a delegated session key, this block describes the scope granted by the master DID. Absent for master keys.
   */
  delegation_scope?: {
    /**
     * The master DID that signed the delegation credential.
     */
    master_did: string;
    /**
     * W3C VC ID of the Delegation Proof credential issued by the master DID.
     */
    delegation_credential_id?: string;
    /**
     * Gate types this session key is permitted to satisfy.
     *
     * @minItems 1
     */
    permitted_gate_types: [
      'payment' | 'credential' | 'identity' | 'agreement' | 'data_request' | 'proof_of_intent' | 'trust',
      ...('payment' | 'credential' | 'identity' | 'agreement' | 'data_request' | 'proof_of_intent' | 'trust')[]
    ];
    /**
     * Optional allowlist of endpoint URL patterns this key may interact with.
     */
    permitted_endpoints?: string[];
    /**
     * Maximum payment amount in USD-equivalent that this session key may authorize per transaction.
     */
    max_payment_amount_usd: number;
    /**
     * ISO 8601 UTC expiry time of this delegation scope. Session keys should have short validity (e.g., 8h).
     */
    expires_at: string;
  };
  /**
   * Present only when binding_model = 'operator_derived'. BIP-32 derivation configuration.
   */
  operator_derived_config?: {
    /**
     * BIP-32 HD derivation path used to derive this agent's key from the operator master seed.
     */
    derivation_path: string;
    /**
     * The operator's master DID from which this agent key is derived.
     */
    master_did?: string;
  };
  /**
   * Present only when binding_model = 'hardware_isolated'. TEE/HSM configuration.
   */
  hardware_config?: {
    /**
     * The hardware security technology used.
     */
    hardware_type?:
      | 'tpm_2.0'
      | 'aws_nitro_enclaves'
      | 'azure_confidential_computing'
      | 'gcp_confidential_vm'
      | 'hsm_pkcs11'
      | 'sgx'
      | 'trustzone';
    /**
     * URL where remote attestation reports can be fetched to verify TEE integrity.
     */
    attestation_endpoint?: string;
  };
  /**
   * Present only when binding_model = 'os_keychain'. OS keychain configuration.
   */
  os_keychain_config?: {
    /**
     * The OS keychain technology.
     */
    platform?: 'apple_secure_enclave' | 'android_keystore' | 'windows_cng' | 'linux_tpm';
    /**
     * If true, biometric authentication is required to access this key.
     */
    biometric_required?: boolean;
  };
  /**
   * DID of the human or organization that operates and controls this agent.
   */
  operator_did?: string;
  /**
   * Indicates whether this wallet is configured for hybrid post-quantum signing (EdDSA + ML-DSA).
   */
  pqc_ready?: boolean;
}

// ────────────────────────────────────────────────────────
// audit-log.json
// ────────────────────────────────────────────────────────
/**
 * Schema for responses from GET /eep/audit-log. Returns a paginated list of signed delivery records covering all agent-publisher interactions: gate proofs, session events, commerce state transitions, and webhook deliveries. Satisfies EU AI Act Art. 12 (logging), DORA Art. 8 (ICT records), and GDPR Art. 5 Data Accountability. Per Whitepaper §10.2 and §14.3 (mandated auditability). (A4).
 */
export interface EEPDeliveryAuditLogResponse {
  /**
   * Ordered list of audit log entries (newest first by default, reversible via sort=asc).
   */
  entries: AuditEntry[];
  /**
   * Total number of audit entries matching the query.
   */
  total: number;
  /**
   * Current page number (1-indexed).
   */
  page: number;
  /**
   * Entries returned per page.
   */
  per_page: number;
  /**
   * Opaque cursor for fetching the next page. Absent when no further pages exist.
   */
  next_cursor?: string;
  /**
   * DID of the publisher whose audit log is returned.
   */
  publisher_did?: string;
}
export interface AuditEntry {
  /**
   * Unique, immutable identifier for this audit entry (UUID v4).
   */
  entry_id: string;
  /**
   * The type of audited event. Uses the EEP event type namespace (com.example.*) or audit-specific prefixes.
   */
  event_type:
    | 'gate.proof.submitted'
    | 'gate.proof.accepted'
    | 'gate.proof.rejected'
    | 'gate.payment.verified'
    | 'gate.payment.rejected'
    | 'session.created'
    | 'session.renewed'
    | 'session.revoked'
    | 'session.expired'
    | 'webhook.delivery.attempted'
    | 'webhook.delivery.succeeded'
    | 'webhook.delivery.failed'
    | 'webhook.delivery.abandoned'
    | 'commerce.offer'
    | 'commerce.counter'
    | 'commerce.accepted'
    | 'commerce.invoice'
    | 'commerce.paid'
    | 'commerce.cancelled'
    | 'data.withdrawal.requested'
    | 'data.withdrawal.acknowledged'
    | 'data.withdrawal.completed'
    | 'poi.validated'
    | 'poi.rejected'
    | 'rate_limit.triggered'
    | 'did.revocation.checked';
  /**
   * DID of the agent or entity that initiated this event.
   */
  actor_did: string;
  /**
   * DID of the EEP publisher recording this event.
   */
  publisher_did: string;
  /**
   * ISO8601 UTC timestamp of when the event occurred.
   */
  timestamp: string;
  /**
   * Result of the audited action.
   */
  outcome: 'success' | 'failure' | 'partial' | 'pending';
  /**
   * The resource tier or identifier the event relates to (e.g., 'premium', '/api/data/v1').
   */
  resource?: string;
  /**
   * For gate events: the type of gate requirement (credential, payment, agreement, data_request, identity, combined).
   */
  gate_type?:
    'credential' | 'payment' | 'agreement' | 'data_request' | 'identity' | 'allowlist' | 'reciprocal' | 'combined';
  /**
   * Short machine-readable reason code for failures. Not surfaced to requesting agents (logged internally only per EEP §10.8).
   */
  failure_reason?: string;
  /**
   * If the event is tied to a session, the opaque session token identifier (not the full token).
   */
  session_token_id?: string;
  /**
   * If the event is part of a commerce negotiation, the negotiation identifier.
   */
  commerce_id?: string;
  /**
   * For webhook delivery events: the attempt number (1 = first attempt).
   */
  delivery_attempt?: number;
  /**
   * For webhook delivery events: the HTTP status code received from the subscriber endpoint.
   */
  http_status?: number;
  /**
   * The nonce used in the gate proof (for gate events). Stored to enforce single-use.
   */
  nonce?: string;
  /**
   * EdDSA (or hybrid ML-DSA) signature over (entry_id + event_type + actor_did + publisher_did + timestamp + outcome), signed by the publisher's DID key. Allows agents and auditors to verify the integrity of audit log entries. The audit log cannot be tampered with without invalidating these per-entry signatures.
   */
  signature: string;
  /**
   * Event-specific additional metadata (e.g., transaction hash for payment events, subscription_id for webhook events, tier for session events). Not schema-validated further to allow future extensibility.
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
}

// ────────────────────────────────────────────────────────
// commerce.negotiation.json
// ────────────────────────────────────────────────────────
/**
 * Schema for commerce messages exchanged over EEP Network Pulse (WebSocket). Commerce messages enable bidirectional price negotiation between agents and entities. Pricing models are extensible; the protocol defines standard models but implementers can add custom ones via x- prefix.
 */
export interface EEPCommerceNegotiation {
  /**
   * Unique identifier for this negotiation session. Generated by the party that sends the initial offer.
   */
  negotiation_id: string;
  /**
   * Identifier or name of the service being negotiated. Can be a service listing ID or a freeform description.
   */
  service: string;
  pricing?: Pricing;
  terms?: Terms;
  /**
   * Optional reason (used with reject or counter actions).
   */
  reason?: string;
  invoice?: Invoice;
  receipt?: Receipt;
  /**
   * Optional party-defined metadata.
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
  /**
   * Pricing discovery mode. fixed: static price list; negotiable: bilateral counter-offer; auction: open RFP auction. (§7.3, G19).
   */
  pricing_mode?: 'fixed' | 'negotiable' | 'auction';
  /**
   * Auction configuration — only present when pricing_mode is 'auction'.
   */
  auction?: {
    /**
     * Auction mechanism type. first_price: highest bidder wins at their price; vickrey: highest bidder wins at second price; reverse: lowest offer wins.
     */
    mechanism: 'first_price' | 'vickrey' | 'reverse';
    /**
     * ISO 8601 datetime when bidding closes.
     */
    close_time: string;
    /**
     * Minimum acceptable price (for first_price/vickrey) or maximum acceptable cost (for reverse). Optional.
     */
    reserve_price?: number;
    /**
     * ISO 4217 currency code.
     */
    currency: string;
    /**
     * Unique RFP identifier. Carried in commerce.rfp.* CloudEvents.
     */
    rfp_id?: string;
  };
  /**
   * W3C VC-structured Allocation Receipt issued to auction winner. Only present in commerce.rfp.closed messages. (§7.3 AllocationReceipt, G19).
   */
  allocation_receipt?: {
    '@context': string[];
    type: string[];
    issuer: string;
    issuanceDate: string;
    credentialSubject: {
      id: string;
      allocation_id: string;
      winning_bid: number;
      currency: string;
      service_id?: string;
      valid_from: string;
      valid_until?: string;
    };
    [k: string]: unknown | undefined;
  };
}
/**
 * The pricing terms being proposed in this message.
 */
export interface Pricing {
  /**
   * Pricing model. Standard models: fixed, per_request, per_event, subscription, metered, tiered_volume. Custom models via x- prefix.
   */
  model: string;
  /**
   * Price amount. Must be non-negative. Zero means free.
   */
  amount?: number;
  /**
   * ISO 4217 currency code (lowercase).
   */
  currency: string;
  /**
   * Billing period (for subscription model).
   */
  period?: 'hour' | 'day' | 'week' | 'month' | 'year';
  /**
   * The billable unit (for metered model).
   */
  unit?: string;
  /**
   * Rate per unit (for metered model).
   */
  rate?: number;
  /**
   * Volume tiers (for tiered_volume model).
   */
  tiers?: {
    /**
     * Upper bound of this tier. Use 'infinity' for the final tier.
     */
    up_to: number | string;
    /**
     * Price per unit in this tier.
     */
    rate: number;
  }[];
  /**
   * Optional minimum charge regardless of usage.
   */
  minimum_charge?: number;
  /**
   * Optional maximum charge (price cap).
   */
  maximum_charge?: number;
}
/**
 * Additional terms and conditions for this negotiation.
 */
export interface Terms {
  /**
   * How the service will be delivered.
   */
  delivery?: 'realtime' | 'async' | 'scheduled' | 'sse' | 'webhook' | 'download';
  /**
   * Seconds until this offer expires. After expiry, the negotiation transitions to 'expired' state.
   */
  expires_in?: number;
  /**
   * Free-text conditions attached to this offer.
   *
   * @maxItems 10
   */
  conditions?:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string];
  /**
   * Cancellation terms.
   */
  cancellation_policy?: 'none' | 'full_refund' | 'partial_refund' | 'no_refund';
  /**
   * Optional service level agreement.
   */
  sla?: {
    uptime_percent?: number;
    response_time_ms?: number;
    support_hours?: string;
  };
}
/**
 * Invoice details (used with the 'invoice' action after service delivery).
 */
export interface Invoice {
  /**
   * Unique invoice identifier.
   */
  invoice_id: string;
  /**
   * Total amount due.
   */
  amount: number;
  currency: string;
  /**
   * Breakdown of charges.
   */
  line_items?: {
    description?: string;
    quantity?: number;
    unit_price?: number;
    total?: number;
  }[];
  /**
   * URLs or identifiers for payment methods.
   */
  payment_methods?: string[];
  /**
   * Payment deadline (ISO 8601).
   */
  due_by?: string;
}
/**
 * Payment receipt (used with the 'receipt' action to confirm payment).
 */
export interface Receipt {
  /**
   * Unique receipt identifier.
   */
  receipt_id: string;
  /**
   * The invoice this payment is for.
   */
  invoice_id?: string;
  /**
   * Proof of payment (provider-specific, opaque to protocol).
   */
  payment_proof: {
    type: string;
    token: string;
    provider?: string;
  };
  paid_at?: string;
}

// ────────────────────────────────────────────────────────
// conformance.credential.json
// ────────────────────────────────────────────────────────
/**
 * W3C Verifiable Credential 2.0-compatible schema for the EEP Conformance Credential issued by eep.dev to publishers that pass the EEP conformance test suite. See SPECIFICATION.md §10.2 and Whitepaper §10.2. Publishers include this credential in their /.well-known/eep.json manifest under the `conformance_credential` field. Agents verify the credential on first contact without querying any registry.
 */
export interface EEPConformanceCredential {
  /**
   * JSON-LD context. Must include W3C VC 2.0 and EEP contexts.
   */
  '@context': string[];
  /**
   * VC type. Must include 'VerifiableCredential' and one of the EEP conformance tier types.
   */
  type: {
    [k: string]: unknown | undefined;
  } & string[];
  /**
   * Unique identifier for this credential instance.
   */
  id?: string;
  /**
   * The DID of the issuer. Must be eep.dev's authoritative DID for the credential to be trusted.
   */
  issuer:
    | string
    | {
        id: string;
        name?: string;
      };
  /**
   * ISO 8601 UTC timestamp when this credential becomes valid (date of conformance test passing).
   */
  validFrom: string;
  /**
   * ISO 8601 UTC timestamp when this credential expires. Per Whitepaper §10.2, conformance credentials expire annually and must be renewed. Agents MUST reject expired conformance credentials.
   */
  validUntil: string;
  /**
   * The publisher that passed the conformance test suite.
   */
  credentialSubject: {
    /**
     * The DID of the publisher that passed conformance testing.
     */
    id: string;
    /**
     * The EEP conformance tier the publisher achieved. Per Whitepaper §10.2 Table 2: Core (Layer 1 + L2 SSE), Standard (Core + Webhooks + credential/payment gates + version negotiation), Full (Standard + L3 WebSockets + commerce + agreement + data_request + session persistence + W3C DPV).
     */
    conformanceTier: 'Core' | 'Standard' | 'Full';
    /**
     * The EEP specification version against which conformance was tested.
     */
    eepVersion?: string;
    /**
     * ISO 8601 UTC timestamp when the conformance test suite was run.
     */
    testedAt: string;
    /**
     * Number of conformance checks passed. Informational.
     */
    passedChecks: number;
    /**
     * Total number of conformance checks run. Informational.
     */
    totalChecks?: number;
    /**
     * URL of the publisher's /.well-known/eep.json manifest that was tested.
     */
    manifestUrl?: string;
    /**
     * Sector-specific conformance extensions (e.g., EEP-FinServ-1.0) that were also tested and passed. See Whitepaper §11.4 and GOVERNANCE.md.
     */
    sectorExtensions?: string[];
    [k: string]: unknown | undefined;
  };
  /**
   * Cryptographic proof over the credential, signed by eep.dev's DID private key. Agents MUST verify this proof before trusting the credential.
   */
  proof: {
    /**
     * Proof type. EEP uses Ed25519Signature2020 or DataIntegrityProof.
     */
    type: 'Ed25519Signature2020' | 'DataIntegrityProof';
    /**
     * ISO 8601 UTC timestamp when the proof was created.
     */
    created: string;
    /**
     * DID URL of the key used to sign this credential. Must resolve to a key in eep.dev's DID Document.
     */
    verificationMethod: string;
    /**
     * Purpose of the proof. Must be 'assertionMethod' for conformance credentials.
     */
    proofPurpose: 'assertionMethod';
    /**
     * Base64url-encoded cryptographic proof value.
     */
    proofValue: string;
    /**
     * Cryptosuite identifier when type is DataIntegrityProof.
     */
    cryptosuite?: string;
  };
  [k: string]: unknown | undefined;
}

// ────────────────────────────────────────────────────────
// data.withdrawal.json
// ────────────────────────────────────────────────────────
/**
 * Schema for the EEP data withdrawal mechanism defined in Whitepaper §7.3 (Right of Withdrawal). An agent's operator may instruct it to withdraw a previously provided data claim via WebSocket `data.withdrawal` message OR via the dedicated REST endpoint `DELETE /data/claims/:claim_id`. This schema covers both the REST request body and the publisher's 202 Accepted response. Publishers MUST acknowledge within 24 hours and purge the withdrawn claim data while keeping the session token valid.
 */
export interface EEPDataWithdrawal {
  [k: string]: unknown | undefined;
}

// ────────────────────────────────────────────────────────
// delegation.proof.json
// ────────────────────────────────────────────────────────
/**
 * A W3C Verifiable Credential issued by an owner DID to an agent DID, defining the permitted actions, endpoints, and spend limits for the delegation. Must be presented alongside the agent's proof for any delegated gate interaction. (§13 Agent Delegation Chains, Whitepaper).
 */
export interface EEPDelegationProofVerifiableCredential {
  /**
   * JSON-LD context array. Must contain W3C VC context and EEP context.
   *
   * @minItems 1
   */
  '@context': [string, ...string[]];
  /**
   * VC type array. Must contain both VerifiableCredential and EEPDelegationProof.
   */
  type: string[];
  /**
   * DID of the entity delegating authority (the owner or parent agent).
   */
  issuer: string;
  /**
   * ISO 8601 datetime when this delegation credential was issued.
   */
  issuanceDate: string;
  /**
   * ISO 8601 datetime when this delegation expires. Agents presenting expired delegation credentials must be rejected.
   */
  expirationDate?: string;
  credentialSubject: {
    /**
     * DID of the delegate (the agent being granted authority).
     */
    id: string;
    /**
     * Explicit list of actions this agent may perform. Agents requesting actions outside this list must be rejected. Delegation credentials without explicit scope restrictions are rejected.
     *
     * @minItems 1
     */
    permitted_actions: [string, ...string[]];
    /**
     * URL patterns the agent is permitted to call. Supports glob patterns (e.g., https://api.example.com/*).
     */
    permitted_endpoints?: string[];
    /**
     * Maximum total payment amount (in currency_code units) the agent may authorise without additional delegation.
     */
    max_payment_amount?: number;
    /**
     * ISO 4217 currency code for max_payment_amount.
     */
    currency_code?: string;
    /**
     * SHA-256 hash of the canonical JSON serialization of this credentialSubject (excluding scope_hash). Used for tamper detection.
     */
    scope_hash?: string;
    /**
     * SHA-256 of the Operator Privacy Policy document the delegator binds sub-agents to (SPEC §11.8). SHOULD be present when delegation may touch data_request gates.
     */
    operator_privacy_policy_hash?: string;
    /**
     * W3C DPV purpose URIs the delegate may claim under data_request (subset of operator policy).
     *
     * @minItems 1
     */
    allowed_dpv_purposes?: [string, ...string[]];
    /**
     * Maximum retention days the delegate may commit to on behalf of the operator.
     */
    max_retention_days?: number;
  };
  /**
   * W3C VC Linked Data Proof or JWT proof from the issuer DID key.
   */
  proof: {
    type: string;
    created?: string;
    /**
     * DID key fragment URI of the verification key used to sign.
     */
    verificationMethod: string;
    proofPurpose?: 'assertionMethod' | 'authentication';
    /**
     * Multibase-encoded proof value.
     */
    proofValue: string;
    [k: string]: unknown | undefined;
  };
  [k: string]: unknown | undefined;
}

// ────────────────────────────────────────────────────────
// delivery.payload.json
// ────────────────────────────────────────────────────────
/**
 * Schema for the full HTTP POST body delivered to a webhook subscriber. Extends event.envelope.json with delivery-specific metadata: unique delivery ID, publisher DID, HMAC-SHA256 delivery signature (sent in X-EEP-Signature header), retry state, and Standard Webhooks (standardwebhooks.com) compatibility headers. Publishers MUST include eep_subscription_id, eep_delivery_id, and eep_delivery_timestamp on every delivery. Agents MUST verify X-EEP-Signature before processing the payload. (A7, Whitepaper §5.2, security.md §2).
 */
export type EEPWebhookDeliveryPayload = EEPEventEnvelope & {
  /**
   * REQUIRED. Identifies which active subscription triggered this delivery. Matches the `subscription_id` returned at subscription creation time.
   */
  eep_subscription_id: string;
  /**
   * REQUIRED. Globally unique, immutable identifier for this specific delivery attempt. Subscribers MUST use this as an idempotency key to deduplicate retried deliveries. UUID v4 format.
   */
  eep_delivery_id: string;
  /**
   * REQUIRED. ISO8601 UTC timestamp of when this delivery was dispatched from the publisher. Used by subscribers to detect staleness and by the audit log to record delivery timing.
   */
  eep_delivery_timestamp: string;
  /**
   * The delivery attempt number (1 = first attempt, 2 = first retry, etc.). Useful for debugging. Publishers SHOULD include this on all deliveries.
   */
  eep_delivery_attempt?: number;
  /**
   * DID of the publisher sending this delivery. Allows subscribers to verify the X-EEP-Signature using the publisher's DID key (for Ed25519-signed deliveries) or the shared HMAC secret. Enables zero-trust webhook verification without prior registration of the publisher.
   */
  eep_publisher_did?: string;
  /**
   * ISO8601 UTC timestamp after which the publisher will attempt the next retry if this delivery fails. Uses exponential backoff: attempt N is retried after min(2^N * 30s, 86400s). Absent on the last attempt.
   */
  eep_next_retry_at?: string;
  /**
   * Total number of delivery attempts the publisher will make before abandoning this event for this subscription (default: 5). Subscribers can use this to predict when delivery will be abandoned and trigger manual recovery.
   */
  eep_max_attempts?: number;
  /**
   * Algorithm used to compute the X-EEP-Signature header value. 'hmac-sha256': HMAC-SHA256 keyed against the subscription secret (subscriber-verifiable without DID lookup). 'eddsa': EdDSA signature over the raw body, signed by eep_publisher_did's key (verifiable via DID Document). Hybrid mode sends both.
   */
  eep_signature_algorithm?: 'hmac-sha256' | 'eddsa' | 'hybrid-hmac-eddsa';
};

/**
 * Schema for a valid EEP/CloudEvents v1.0.2 event. All EEP events MUST conform to this schema. This is a superset of the CloudEvents v1.0.2 envelope with EEP-specific extensions. See SPECIFICATION.md §13 for the canonical event type registry.
 */
export interface EEPEventEnvelope {
  /**
   * CloudEvents spec version. MUST be '1.0'.
   */
  specversion: '1.0';
  /**
   * Unique identifier for this event. Used for deduplication. Publishers MUST guarantee uniqueness within a source. Subscribers MUST use this field to implement idempotent processing.
   */
  id: string;
  /**
   * The URI/DID of the entity that originated this event. For EEP events, this SHOULD be a valid DID.
   */
  source: string;
  /**
   * The event type in reverse-domain dot notation. Format: {reverse-domain}.{entity-type}.{action}. Well-known EEP event types are listed in eep_known_event_types below and documented normatively in SPECIFICATION.md §13.
   */
  type: string;
  /**
   * RFC 3339 / ISO 8601 timestamp of when the event occurred. MUST be in UTC.
   */
  time: string;
  /**
   * MIME type of the data field. MUST be 'application/json' for EEP events.
   */
  datacontenttype: 'application/json';
  /**
   * CloudEvents v1.0.2 OPTIONAL context attribute. Identifies the subject of the event within the context of `source` — for example the specific resource that changed. Subscribers can filter on it without parsing `data`, which is why publishers SHOULD set it whenever an event concerns one addressable thing.
   */
  subject?: string;
  /**
   * CloudEvents v1.0.2 OPTIONAL context attribute. Absolute URI of a schema describing `data`. Lets a subscriber validate or typed-decode the payload before touching it, and lets an agent discover the payload contract without out-of-band documentation.
   */
  dataschema?: string;
  /**
   * CloudEvents Claim Check extension. Absolute URI at which the full payload can be retrieved. Lets a publisher send a small reference instead of a large body; when present without `data`, the subscriber MUST fetch this URI to obtain the payload. Retrieval is subject to the entity's gates.
   */
  dataref?: string;
  /**
   * CloudEvents Distributed Tracing extension, carrying a W3C Trace Context `traceparent`. Propagating it across the publisher/subscriber boundary is what keeps an agent's causal chain intact through a multi-hop workflow.
   */
  traceparent?: string;
  /**
   * CloudEvents Distributed Tracing extension, carrying a W3C Trace Context `tracestate`. Vendor-specific trace data accompanying `traceparent`.
   */
  tracestate?: string;
  /**
   * The event payload. Structure varies by event type. Refer to the Event Catalog in SPECIFICATION.md §13 for the normative schema of each event type.
   */
  data?: {};
  /**
   * EEP specification version that governs this event's format.
   */
  eep_version?: string;
  /**
   * The ID of the subscription this event was delivered for. Present in webhook and SSE deliveries, absent in audit logs.
   */
  eep_subscription_id?: string;
  /**
   * A snapshot of the source entity's trust score at the time this event was emitted. Allows subscribers to contextualize events without requiring a separate trust lookup.
   */
  eep_trust_score?: number;
  /**
   * Describes what category of actor triggered this event.
   */
  eep_actor_type?: 'human' | 'agent' | 'system' | 'cron';
  /**
   * The access tier under which this event was delivered. Allows subscribers to know whether they are receiving full or filtered content. Absent means no gating is applied.
   */
  eep_tier?: string;
  /**
   * On-chain ERC-8004 reputation score of the source entity at event time (0-100)
   */
  eep_reputation_score?: number;
  /**
   * On-chain DID linked to the entity via ERC-8004 NFT token
   */
  eep_on_chain_did?: string;
  /**
   * NORMATIVE EVENT TYPE REGISTRY (SPECIFICATION.md §13). The suffix portion of canonical EEP event types. Publishers use these as the action portion of their typed events.
   */
  eep_known_event_types?:
    | 'entity.updated'
    | 'entity.state.changed'
    | 'trust.changed'
    | 'trust.signal.added'
    | 'trust.signal.removed'
    | 'trust.signal.revoked'
    | 'session.created'
    | 'session.renewed'
    | 'session.revoked'
    | 'agent.task.created'
    | 'agent.task.started'
    | 'agent.task.completed'
    | 'agent.task.failed'
    | 'agent.task.delegated'
    | 'data.withdrawal.requested'
    | 'data.withdrawal.acknowledged'
    | 'data.withdrawal.completed'
    | 'commerce.rfp.open'
    | 'commerce.rfp.bid'
    | 'commerce.rfp.closed'
    | 'commerce.agreement.proposed'
    | 'commerce.agreement.signed'
    | 'commerce.payment.received'
    | 'commerce.payment.confirmed'
    | 'gate.access.granted'
    | 'gate.access.denied'
    | 'gate.access.expired';
  [k: string]: unknown | undefined;
}

// ────────────────────────────────────────────────────────
// eep-manifest.json
// ────────────────────────────────────────────────────────
/**
 * The /.well-known/eep.json manifest declaring an entity's EEP capabilities
 */
export interface EEPManifest {
  /**
   * W3C Decentralized Identifier of the entity
   */
  did: string;
  /**
   * EEP specification version this entity is currently operating at (e.g. '0.1').
   */
  eep_version: string;
  /**
   * List of EEP specification versions this entity supports. Agents send EEP-Version header; publisher confirms or returns HTTP 505. (§5.4, G21).
   *
   * @minItems 1
   */
  eep_versions?: [string, ...string[]];
  /**
   * The EEP version this entity prefers when a client sends multiple accepted versions.
   */
  preferred_version?: string;
  layers: {
    /**
     * Layer 1 REST state endpoint URL
     */
    layer1: string;
    /**
     * Layer 2a SSE stream URL
     */
    layer2_sse?: string;
    /**
     * Layer 2b webhook subscription endpoint URL
     */
    layer2_webhook?: string;
    /**
     * Layer 3 WebSocket pulse URL
     */
    layer3_ws?: string;
  };
  /**
   * MIME types the entity can return via Content Negotiation
   *
   * @minItems 1
   */
  supported_content_types: [string, ...string[]];
  /**
   * Gate configuration endpoint URL
   */
  gates_url?: string;
  /**
   * Service catalog endpoint URL
   */
  services_url?: string;
  /**
   * Dynamic Capability Discovery endpoint (G5)
   */
  capabilities_query_url?: string;
  /**
   * ERC-8004 on-chain reputation binding (ref28)
   */
  reputation?: {
    /**
     * ERC-721 contract address
     */
    contract: string;
    /**
     * Blockchain network
     */
    chain: string;
    /**
     * 8004Scan URL for this agent record
     */
    scan_url?: string;
  };
  /**
   * Post-Quantum Cryptography readiness flag (NIST FIPS 203/204/205 — ref26)
   */
  pqc_ready: boolean;
  /**
   * Supported PQC algorithms
   */
  pqc_algorithms?: string[];
  /**
   * Ordered list of signing algorithm identifiers supported by this publisher for DID-based proof verification, from most preferred to least preferred. Agents MUST select the strongest mutually supported algorithm. When multiple algorithms are shared, the agent picks the publisher's highest-preference match. If no overlap exists, the agent MUST abort and return an error. Per Whitepaper §10.9 (crypto-agility) and NIST FIPS 204/205. Classical algorithms (EdDSA, ES256K) remain valid; PQC algorithms supplement them via hybrid signatures. (A1).
   *
   * @minItems 1
   */
  signing_algorithms?: [
    (
      | 'EdDSA'
      | 'ES256K'
      | 'ES256'
      | 'ML-DSA-65'
      | 'ML-DSA-87'
      | 'SLH-DSA-128s'
      | 'hybrid-EdDSA-ML-DSA-65'
      | 'hybrid-EdDSA-ML-DSA-87'
    ),
    ...(
      | 'EdDSA'
      | 'ES256K'
      | 'ES256'
      | 'ML-DSA-65'
      | 'ML-DSA-87'
      | 'SLH-DSA-128s'
      | 'hybrid-EdDSA-ML-DSA-65'
      | 'hybrid-EdDSA-ML-DSA-87'
    )[]
  ];
  /**
   * Whether this entity accepts x402 protocol payments (ref27)
   */
  x402_enabled: boolean;
  /**
   * x402 payment rail configuration
   */
  x402?: {
    facilitator_url?: string;
    payment_rails?: string[];
    network?: string;
  };
  /**
   * Regulatory compliance declarations
   */
  compliance?: {
    /**
     * Entity complies with EU AI Act obligations (ref30)
     */
    eu_ai_act?: boolean;
    /**
     * Entity is GDPR-compliant
     */
    gdpr?: boolean;
    /**
     * Entity is compliant with EU DORA (Digital Operational Resilience Act, EU 2022/2554)
     */
    dora?: boolean;
    /**
     * Entity's credential stack is architecturally aligned with eIDAS 2.0 (EU 2024/1183) W3C VC wallet requirements
     */
    eidas2?: boolean;
    /**
     * Semantically compatible with W3C ANP metadata (ref29)
     */
    anp_compatible?: boolean;
    /**
     * W3C DPV purpose URI
     */
    dpv_purpose?: string;
    /**
     * W3C DPV retention policy URI
     */
    dpv_retention?: string;
  };
  /**
   * Data residency constraint. Declares where publisher stores and processes data received from agent interactions. ISO 3166-1 region or country code — see also GDPR/DORA requirements. (§14.2, G22).
   */
  data_residency?: string;
  /**
   * Multi-chain payment configuration. Each entry declares a payment address on one blockchain network. Agents with multi-chain wallets may select the cheapest/fastest. (§8.3, G22).
   */
  payment_networks?: {
    /**
     * Blockchain network identifier.
     */
    chain: string;
    /**
     * Payment address or smart contract on this chain.
     */
    address: string;
    /**
     * Minimum on-chain confirmation blocks before payment is considered final.
     */
    min_confirmations?: number;
  }[];
  /**
   * Pricing discovery mode for this entity's services. fixed: static price list; negotiable: bilateral counter-offer; auction: open auction (RFP). (§7.3, G19/G22).
   */
  pricing_mode?: 'fixed' | 'negotiable' | 'auction';
  /**
   * ISO8601 timestamp of last manifest update
   */
  updated_at?: string;
  /**
   * Transport security mode for this endpoint per Whitepaper §9.1. Declares whether this publisher requires standard TLS or mutual TLS (mTLS). Agents MUST check this field before connecting and present DID-backed client certificates when mTLS or mTLS-required is declared. (§9.1, G34).
   */
  tls_mode?: 'standard' | 'mTLS' | 'mTLS-required';
  /**
   * Whether this publisher enforces Forward Secrecy (ECDHE/DHE key exchange) for all long-lived connections (SSE, WebSocket). Per EEP Whitepaper §10.1 and security.md §11, forward secrecy is mandatory for WS/SSE endpoints. Publishers SHOULD set this to true once they have verified their TLS configuration. Agents MAY refuse to connect to WS/SSE endpoints where this is false or absent. (G38).
   */
  forward_secrecy_enforced?: boolean;
  /**
   * Alternative discovery mechanism hints per Whitepaper §4.4 (DNS and Link Header Discovery). For IoT devices, constrained environments, or deployments where /.well-known/ endpoints are not accessible, publishers can declare alternative discovery paths. Agents that cannot reach /.well-known/eep.json SHOULD check DNS TXT records and Link headers before failing. See docs/guides/iot-discovery.md for implementation details.
   */
  discovery_hints?: {
    /**
     * Whether this entity publishes a 'Link: <manifest-url>; rel="eep"' header on its root HTTP response. Agents can discover EEP capability by inspecting any HTTP response from this entity. Per Whitepaper §4.4.
     */
    link_header_supported?: boolean;
    /**
     * The DNS TXT record this entity publishes at _eep.{domain} for alternative discovery. Format: 'v=eep1; manifest={url}'. Agents MUST validate the manifest URL is HTTPS. Per Whitepaper §4.4 and SPECIFICATION.md §4.4.
     */
    dns_txt_record?: string;
    /**
     * For IoT publishers that periodically broadcast their manifest URL via mDNS/DNS-SD or BLE Advertisement. Interval in seconds between broadcasts. Agents in constrained networks can listen for beacons instead of polling.
     */
    beacon_interval_seconds?: number;
  };
  /**
   * The EEP Conformance Credential issued by eep.dev's DID for this publisher. Allows agents to verify conformance tier on first contact without querying any registry. See schemas/v0.1/conformance.credential.json for the full schema and Whitepaper §10.2. The credential expires annually and must be renewed. Agents MUST verify the proof and validUntil before trusting the credential. (G39).
   */
  conformance_credential?: {
    /**
     * Must include 'VerifiableCredential' and a specific EEP conformance tier type.
     */
    type: string[];
    /**
     * DID of the issuer. Must resolve to did:web:eep.dev for the credential to be trusted.
     */
    issuer:
      | string
      | {
          id: string;
        };
    validFrom: string;
    validUntil: string;
    credentialSubject: {
      /**
       * DID of the publisher (must match this manifest's did).
       */
      id: string;
      conformanceTier: 'Core' | 'Standard' | 'Full';
      eepVersion?: string;
      testedAt: string;
      passedChecks?: number;
      totalChecks?: number;
      manifestUrl?: string;
      sectorExtensions?: string[];
    };
    proof: {
      type: string;
      created: string;
      verificationMethod: string;
      proofPurpose: 'assertionMethod';
      proofValue: string;
    };
    [k: string]: unknown | undefined;
  };
}

// ────────────────────────────────────────────────────────
// eep-pulse-message-schema.json
// ────────────────────────────────────────────────────────
/**
 * JSON Schema for WebSocket messages in the EEP Network Pulse (Layer 3). All messages use a { v, type, action, seq?, data? } envelope.
 */
export type EEPNetworkPulseMessageSchema = SystemMessage | EntityMessage | A2AMessage | ChatMessage | CommerceMessage;
export type SystemMessage = BaseEnvelope & {
  type: 'system';
  action:
    | 'connected'
    | 'ping'
    | 'pong'
    | 'subscribe'
    | 'subscribed'
    | 'unsubscribe'
    | 'unsubscribed'
    | 'replay'
    | 'replay_complete'
    | 'gap_detected'
    | 'auth_expiring'
    | 'auth_refresh'
    | 'auth_refreshed'
    | 'auth_expired'
    | 'error';
};
export type EntityMessage = BaseEnvelope & {
  type: 'entity';
  action: 'update' | 'publish' | 'delete';
  data?: {
    /**
     * DID of the entity originating this event.
     */
    source_did: string;
  };
};
export type A2AMessage = BaseEnvelope & {
  type: 'a2a';
  action:
    | 'task_request'
    | 'task_accepted'
    | 'task_received'
    | 'task_progress'
    | 'task_progress_ack'
    | 'task_complete'
    | 'task_complete_ack'
    | 'task_failed'
    | 'task_failed_ack'
    | 'task_cancel'
    | 'task_cancel_ack'
    | 'task_cancelled';
};
export type ChatMessage = BaseEnvelope & {
  type: 'chat';
  action: 'send' | 'sent' | 'received' | 'history' | 'read' | 'read_ack';
};
export type CommerceMessage = BaseEnvelope & {
  type: 'commerce';
  /**
   * Commerce negotiation actions. See commerce.negotiation.json for data payload schema.
   */
  action: 'offer' | 'counter' | 'accept' | 'reject' | 'expire' | 'invoice' | 'receipt' | 'complete' | 'dispute';
  data?: {
    /**
     * Unique negotiation session identifier.
     */
    negotiation_id: string;
  };
};

export interface BaseEnvelope {
  /**
   * Protocol version. Clients MUST disconnect on version mismatch.
   */
  v: 1;
  /**
   * Monotonic sequence number per channel. Used for gap detection and replay.
   */
  seq?: number;
  /**
   * Action-specific payload.
   */
  data?: {};
}

// ────────────────────────────────────────────────────────
// eep-registry.json
// ────────────────────────────────────────────────────────
/**
 * Served at /.well-known/eep-registry.json. Declares that this domain operates a federated EEP registry. Used by agents to verify registry trust, and by eep.dev to issue Federation Credentials. (§4.5 Registry Federation, Whitepaper).
 */
export interface EEPRegistryFederationManifest {
  /**
   * DID of this registry operator organization.
   */
  did: string;
  /**
   * Human-readable name for this registry.
   */
  registry_name: string;
  /**
   * Base URL of this registry's API.
   */
  registry_url?: string;
  /**
   * Scope of entities this registry covers.
   */
  scope: {
    /**
     * ISO 3166-1 alpha-2 country codes or region strings this registry covers.
     */
    geography?: string[];
    /**
     * Industry sector identifiers this registry specializes in.
     */
    sectors?: string[];
    /**
     * EEP gate types or capability categories this registry validates.
     */
    capabilities?: string[];
  };
  /**
   * Describes the trust verification methodology this registry applies to registrants.
   */
  trust_criteria?: {
    /**
     * Whether registrants must prove DID ownership.
     */
    did_verification?: boolean;
    /**
     * Whether registrant /.well-known/eep.json is validated for consistency.
     */
    manifest_consistency_check?: boolean;
    additional_checks?: string[];
  };
  /**
   * Minimum EEP conformance tier required for entities to be listed in this registry. Per Whitepaper §10.2: Core (Layer 1 + SSE), Standard (Core + Webhooks + credential/payment gates), Full (Standard + WS + commerce + agreement + data_request + session). No other tiers are defined.
   */
  conformance_tier_required: 'Core' | 'Standard' | 'Full';
  /**
   * URL where this registry's EEP Federation Credential (issued by eep.dev) can be fetched and verified by agents.
   */
  federation_credential_url: string;
  /**
   * API endpoint implementing cross-registry resolution. When an entity is not found in this registry, queries peer registries.
   */
  cross_registry_resolution_url?: string;
  /**
   * EEP protocol version this registry speaks.
   */
  eep_version?: string;
  /**
   * ISO 8601 datetime of last manifest update.
   */
  updated_at?: string;
  /**
   * Machine-readable sustainability and pricing signals for registry APIs (SPEC §12.6.1).
   */
  economics?: {
    registration_fee?: {
      amount?: number;
      currency?: string;
      per?: 'once' | 'year' | 'month';
    };
    query_quota?: {
      free_requests_per_day?: number;
      paid_tier_url?: string;
    };
    staking_or_challenge?: {
      mode?: 'none' | 'micro_stake' | 'proof_of_payment' | 'proof_of_work_challenge';
      min_amount?: number;
      currency?: string;
      challenge_endpoint?: string;
    };
  };
}

// ────────────────────────────────────────────────────────
// event.envelope.json
// ────────────────────────────────────────────────────────
/**
 * Schema for a valid EEP/CloudEvents v1.0.2 event. All EEP events MUST conform to this schema. This is a superset of the CloudEvents v1.0.2 envelope with EEP-specific extensions. See SPECIFICATION.md §13 for the canonical event type registry.
 */
export interface EEPEventEnvelope {
  /**
   * CloudEvents spec version. MUST be '1.0'.
   */
  specversion: '1.0';
  /**
   * Unique identifier for this event. Used for deduplication. Publishers MUST guarantee uniqueness within a source. Subscribers MUST use this field to implement idempotent processing.
   */
  id: string;
  /**
   * The URI/DID of the entity that originated this event. For EEP events, this SHOULD be a valid DID.
   */
  source: string;
  /**
   * The event type in reverse-domain dot notation. Format: {reverse-domain}.{entity-type}.{action}. Well-known EEP event types are listed in eep_known_event_types below and documented normatively in SPECIFICATION.md §13.
   */
  type: string;
  /**
   * RFC 3339 / ISO 8601 timestamp of when the event occurred. MUST be in UTC.
   */
  time: string;
  /**
   * MIME type of the data field. MUST be 'application/json' for EEP events.
   */
  datacontenttype: 'application/json';
  /**
   * CloudEvents v1.0.2 OPTIONAL context attribute. Identifies the subject of the event within the context of `source` — for example the specific resource that changed. Subscribers can filter on it without parsing `data`, which is why publishers SHOULD set it whenever an event concerns one addressable thing.
   */
  subject?: string;
  /**
   * CloudEvents v1.0.2 OPTIONAL context attribute. Absolute URI of a schema describing `data`. Lets a subscriber validate or typed-decode the payload before touching it, and lets an agent discover the payload contract without out-of-band documentation.
   */
  dataschema?: string;
  /**
   * CloudEvents Claim Check extension. Absolute URI at which the full payload can be retrieved. Lets a publisher send a small reference instead of a large body; when present without `data`, the subscriber MUST fetch this URI to obtain the payload. Retrieval is subject to the entity's gates.
   */
  dataref?: string;
  /**
   * CloudEvents Distributed Tracing extension, carrying a W3C Trace Context `traceparent`. Propagating it across the publisher/subscriber boundary is what keeps an agent's causal chain intact through a multi-hop workflow.
   */
  traceparent?: string;
  /**
   * CloudEvents Distributed Tracing extension, carrying a W3C Trace Context `tracestate`. Vendor-specific trace data accompanying `traceparent`.
   */
  tracestate?: string;
  /**
   * The event payload. Structure varies by event type. Refer to the Event Catalog in SPECIFICATION.md §13 for the normative schema of each event type.
   */
  data?: {};
  /**
   * EEP specification version that governs this event's format.
   */
  eep_version?: string;
  /**
   * The ID of the subscription this event was delivered for. Present in webhook and SSE deliveries, absent in audit logs.
   */
  eep_subscription_id?: string;
  /**
   * A snapshot of the source entity's trust score at the time this event was emitted. Allows subscribers to contextualize events without requiring a separate trust lookup.
   */
  eep_trust_score?: number;
  /**
   * Describes what category of actor triggered this event.
   */
  eep_actor_type?: 'human' | 'agent' | 'system' | 'cron';
  /**
   * The access tier under which this event was delivered. Allows subscribers to know whether they are receiving full or filtered content. Absent means no gating is applied.
   */
  eep_tier?: string;
  /**
   * On-chain ERC-8004 reputation score of the source entity at event time (0-100)
   */
  eep_reputation_score?: number;
  /**
   * On-chain DID linked to the entity via ERC-8004 NFT token
   */
  eep_on_chain_did?: string;
  /**
   * NORMATIVE EVENT TYPE REGISTRY (SPECIFICATION.md §13). The suffix portion of canonical EEP event types. Publishers use these as the action portion of their typed events.
   */
  eep_known_event_types?:
    | 'entity.updated'
    | 'entity.state.changed'
    | 'trust.changed'
    | 'trust.signal.added'
    | 'trust.signal.removed'
    | 'trust.signal.revoked'
    | 'session.created'
    | 'session.renewed'
    | 'session.revoked'
    | 'agent.task.created'
    | 'agent.task.started'
    | 'agent.task.completed'
    | 'agent.task.failed'
    | 'agent.task.delegated'
    | 'data.withdrawal.requested'
    | 'data.withdrawal.acknowledged'
    | 'data.withdrawal.completed'
    | 'commerce.rfp.open'
    | 'commerce.rfp.bid'
    | 'commerce.rfp.closed'
    | 'commerce.agreement.proposed'
    | 'commerce.agreement.signed'
    | 'commerce.payment.received'
    | 'commerce.payment.confirmed'
    | 'gate.access.granted'
    | 'gate.access.denied'
    | 'gate.access.expired';
  [k: string]: unknown | undefined;
}

// ────────────────────────────────────────────────────────
// gate.402-response.json
// ────────────────────────────────────────────────────────
/**
 * Schema for the HTTP 402 response body returned when an agent requests a resource that requires a higher tier. The response is machine-readable so agents can programmatically determine what requirements to satisfy.
 */
export interface EEPAccessRestrictionResponse402 {
  /**
   * Error code. Always 'access_restricted'.
   */
  error: 'access_restricted';
  /**
   * The resource pattern that was requested but not accessible.
   */
  resource: string;
  /**
   * The tier the agent currently has access to.
   */
  current_tier: string;
  /**
   * The minimum tier required to access the requested resource.
   */
  required_tier: string;
  /**
   * List of requirements the agent has not yet satisfied. Each entry includes the requirement type, the specific fields needed, and an optional resolution hint for the agent.
   */
  unmet_requirements: {
    /**
     * The requirement type that was not met.
     */
    type: string;
    /**
     * A human/agent-readable hint on how to satisfy this requirement.
     */
    resolution_hint?: string;
    [k: string]: unknown | undefined;
  }[];
  /**
   * Map of tiers that would grant access to the requested resource. Includes their labels, requirements, and access patterns so agents can choose which tier to satisfy.
   */
  available_tiers?: {
    [k: string]:
      | {
          label?: string;
          description?: string;
          requirements?: {}[];
          access?: string[];
        }
      | undefined;
  };
  /**
   * URL where the full gate configuration can be retrieved.
   */
  gates_config_url?: string;
  /**
   * Optional: seconds to wait before retrying (e.g., if a time-based requirement will be met soon).
   */
  retry_after?: number;
}

// ────────────────────────────────────────────────────────
// gate.403-response.json
// ────────────────────────────────────────────────────────
/**
 * Returned when a credential, agreement, identity, or allowlist gate prevents access
 */
export interface EEPGate403ForbiddenResponse {
  /**
   * Fixed error code distinguishing from payment restriction (402)
   */
  error: 'access_forbidden';
  /**
   * The resource path or pattern that was requested
   */
  resource: string;
  /**
   * The tier the requesting agent currently holds
   */
  current_tier: string;
  /**
   * The minimum tier needed to access the resource
   */
  required_tier: string;
  /**
   * List of specific requirements not satisfied
   *
   * @minItems 1
   */
  unmet_requirements: [
    {
      type: string;
      /**
       * Machine-readable instruction for how to satisfy this requirement
       */
      resolution_hint?: string;
    },
    ...{
      type: string;
      /**
       * Machine-readable instruction for how to satisfy this requirement
       */
      resolution_hint?: string;
    }[]
  ];
  /**
   * URL to full gate configuration for the entity
   */
  gates_config_url?: string;
}

// ────────────────────────────────────────────────────────
// gate.429-response.json
// ────────────────────────────────────────────────────────
/**
 * Schema for HTTP 429 Too Many Requests response body returned by EEP publishers implementing DID-based token-bucket rate limiting. See SPECIFICATION.md §3.4.6 and Whitepaper §10.5.
 */
export interface EEPRateLimitResponse429 {
  /**
   * Machine-readable error code. Always 'rate_limited' for 429 responses.
   */
  error: 'rate_limited';
  /**
   * The DID that was rate-limited. DID-based limiting (not IP-based) per EEP spec.
   */
  did_rate_limit_key: string;
  /**
   * Number of seconds the agent must wait before retrying. MUST match the Retry-After HTTP response header value.
   */
  retry_after_seconds: number;
  /**
   * ISO 8601 UTC timestamp when the rate-limit window resets.
   */
  window_reset_at: string;
  /**
   * A publisher-signed challenge token the agent MUST include as the X-EEP-RL-Challenge header on its retry request. Prevents IP-rotation evasion. Format: base64url(nonce + '.' + publisher_did + '.' + expires_at + '.' + signature).
   */
  signed_challenge: string;
  /**
   * The total number of requests allowed per window for this DID (informational).
   */
  limit_per_window?: number;
  /**
   * Number of requests this DID has made in the current window (informational).
   */
  requests_made?: number;
  /**
   * Human-readable explanation of the rate limit.
   */
  message?: string;
}

// ────────────────────────────────────────────────────────
// gate.451-response.json
// ────────────────────────────────────────────────────────
/**
 * Returned when a resource is unavailable for legal reasons (EU AI Act, DORA, judicial orders, etc.)
 */
export interface EEPGate451LegallyRestrictedResponse {
  /**
   * Fixed error code for HTTP 451 legal restriction
   */
  error: 'legally_restricted';
  /**
   * The resource path that is legally restricted
   */
  resource: string;
  /**
   * Human-readable description of the legal restriction
   */
  reason: string;
  /**
   * Legal instrument imposing the restriction
   */
  legal_basis?: string;
  /**
   * Geographic or legal jurisdiction
   */
  jurisdiction?: string;
  /**
   * Contact address (email or URL) for legal queries
   */
  contact?: string;
}

// ────────────────────────────────────────────────────────
// gate.config.json
// ────────────────────────────────────────────────────────
/**
 * A single requirement. The 'type' field determines which additional fields are expected. Standard types are defined below; custom types use the 'x-' prefix.
 */
export type Requirement = {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
} & {
  /**
   * Requirement type identifier. Standard types: payment, trust, identity, connection, credential, capability, allowlist, reciprocal, data_request, agreement, combined. Custom types: x-{name}.
   */
  type: string;
};

/**
 * Schema for an entity's gate configuration. Gates define access tiers with customizable requirements. Tier names, requirement combinations, and access patterns are fully entity-defined. The protocol defines requirement TYPES, not VALUES.
 */
export interface EEPGateConfiguration {
  /**
   * The tier applied when no gate proofs are provided. This tier MUST exist in the tiers map and MUST have an empty requirements array (publicly accessible).
   */
  default_tier: string;
  /**
   * Entity-defined tiers. Keys are tier identifiers (lowercase alphanumeric + underscores, max 32 chars). An entity can define any tier names it wants.
   */
  tiers: {
    [k: string]: Tier;
  };
  /**
   * What happens when a request doesn't match any tier. 'restrict' returns 402; 'default' falls back to default_tier silently.
   */
  fallback_behavior?: 'restrict' | 'default';
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[a-z][a-z0-9_]{0,31}$".
 */
export interface Tier {
  /**
   * Human-readable tier name for display (entity-defined).
   */
  label?: string;
  /**
   * Optional description of what this tier provides.
   */
  description?: string;
  /**
   * List of requirements that MUST ALL be satisfied (AND logic) to access this tier. Empty array means no requirements (public access).
   *
   * @maxItems 10
   */
  requirements:
    | []
    | [Requirement]
    | [Requirement, Requirement]
    | [Requirement, Requirement, Requirement]
    | [Requirement, Requirement, Requirement, Requirement]
    | [Requirement, Requirement, Requirement, Requirement, Requirement]
    | [Requirement, Requirement, Requirement, Requirement, Requirement, Requirement]
    | [Requirement, Requirement, Requirement, Requirement, Requirement, Requirement, Requirement]
    | [Requirement, Requirement, Requirement, Requirement, Requirement, Requirement, Requirement, Requirement]
    | [
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement
      ]
    | [
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement,
        Requirement
      ];
  /**
   * Resource patterns this tier grants access to. Supports wildcard suffix: 'profile.*' matches all profile fields. '*' matches everything.
   *
   * @minItems 1
   * @maxItems 100
   */
  access: [string, ...string[]];
  rate_limit?: RateLimit;
  /**
   * Optional entity-defined metadata for this tier.
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
}
/**
 * Optional per-tier rate limits. Overrides platform defaults for this tier.
 */
export interface RateLimit {
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  concurrent_connections?: number;
}

// ────────────────────────────────────────────────────────
// gate.proof.json
// ────────────────────────────────────────────────────────
/**
 * A single proof. Structure varies by type. The 'type' field must match a requirement type from the gate configuration.
 */
export type Proof = {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  [k: string]: unknown | undefined;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
} & {
  /**
   * Proof type, must match the requirement type it satisfies.
   */
  type: string;
  /**
   * When this proof was issued (ISO 8601). Used for freshness validation.
   */
  issued_at?: string;
  /**
   * When this proof expires (ISO 8601). Null or absent means the proof does not expire.
   */
  expires_at?: string;
  /**
   * Optional nonce to prevent replay attacks.
   */
  nonce?: string;
};

/**
 * Schema for gate proofs submitted by agents to satisfy tier requirements. Each proof corresponds to a requirement type. Structural validation happens at the protocol level; semantic validation (e.g., verifying a payment token is actually valid) is the responsibility of the implementing platform via the ProofVerifier interface.
 */
export interface EEPGateProof {
  /**
   * Array of proof objects. Each proof satisfies one requirement. Multiple proofs can be provided to satisfy multi-requirement tiers.
   *
   * @minItems 1
   * @maxItems 10
   */
  gate_proofs:
    | [Proof]
    | [Proof, Proof]
    | [Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof]
    | [Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof, Proof];
}

// ────────────────────────────────────────────────────────
// operator.privacy-policy.json
// ────────────────────────────────────────────────────────
/**
 * Signed JSON document that defines an agent's standing data-sharing policy. The agent consults this profile before responding to any data_request gate, enabling autonomous privacy decisions within human-defined constraints. (§7.4, Whitepaper).
 */
export interface EEPOperatorPrivacyPolicyProfile {
  /**
   * DID of the human/organizational operator that authored this policy.
   */
  operator_did: string;
  /**
   * Monotonically increasing version identifier for this policy.
   */
  version: string;
  /**
   * ISO 8601 datetime when this policy was issued/signed.
   */
  issued_at: string;
  /**
   * Claim types the agent may share without any human confirmation.
   */
  freely_shareable_claims?: string[];
  /**
   * Claim types that require explicit human confirmation before sharing. Agent pauses and surfaces the decision.
   */
  human_confirmation_required?: string[];
  /**
   * Claim types that must never be shared, regardless of what access they would unlock.
   */
  unconditionally_refused?: string[];
  /**
   * Maximum retention_days the operator will accept in a data_request gate. Requests with higher retention must be refused or confirmed.
   */
  max_retention_days?: number;
  /**
   * Whether the agent may share data with publishers not registered on eep.dev. Set to false for strict privacy.
   */
  allow_unverified_publishers?: boolean;
  /**
   * W3C DPV purpose URIs the agent may share data for. Any purpose not in this list requires human confirmation.
   */
  dpv_purposes_allowed?: string[];
  /**
   * EdDSA signature by operator_did over a canonical JSON serialization of this document (excluding operator_signature). Makes the policy tamper-evident.
   */
  operator_signature?: string;
}

// ────────────────────────────────────────────────────────
// operator.spending-policy.json
// ────────────────────────────────────────────────────────
/**
 * Signed document defining an agent's spending constraints. Consulted before any payment gate interaction to ensure the agent acts within operator-defined financial limits. (§8.4, Whitepaper).
 */
export interface EEPOperatorSpendingPolicyProfile {
  /**
   * DID of the human/organizational operator that authored this spending policy.
   */
  operator_did: string;
  /**
   * Monotonically increasing version identifier.
   */
  version: string;
  /**
   * ISO 8601 datetime when this policy was issued.
   */
  issued_at: string;
  /**
   * Maximum allowed spend per single transaction by currency.
   */
  max_per_transaction?: {
    [k: string]: number | undefined;
  };
  /**
   * Maximum cumulative spend per rolling 1-hour window by currency. Agent pauses if exceeded.
   */
  max_per_hour?: {
    [k: string]: number | undefined;
  };
  /**
   * Maximum cumulative spend per rolling 24-hour window by currency.
   */
  max_per_day?: {
    [k: string]: number | undefined;
  };
  /**
   * Blockchain networks the agent is permitted to transact on. Transactions on non-listed chains are refused.
   */
  approved_chains?: string[];
  /**
   * Gate recipient categories the agent may pay. If set, any recipient not matching is refused without human confirmation.
   */
  approved_recipient_categories?: string[];
  /**
   * Minimum EEP conformance level the recipient must hold before the agent may pay. Per Whitepaper §10.2: Core, Standard, or Full. The agent refuses payment to recipients below this tier without human confirmation.
   */
  require_recipient_conformance_level?: 'Core' | 'Standard' | 'Full';
  /**
   * If true, agent must wait for on-chain finality (using publisher's declared min_confirmations) before marking payment complete.
   */
  require_on_chain_confirmation?: boolean;
  /**
   * EdDSA signature by operator_did over canonical JSON of this document (excluding operator_signature).
   */
  operator_signature?: string;
}

// ────────────────────────────────────────────────────────
// registry.search-result.json
// ────────────────────────────────────────────────────────
/**
 * Response schema for the eep.dev Registry Discovery API: GET /registry and GET /discover. Agents query the registry to find EEP publishers by category, gate type, conformance tier, or capability. The registry resolves queries across its own index and any federated peer registries. Implements Whitepaper §4.2 (eep.dev: The Protocol Registry and Bootstrapping Hub).
 */
export interface EEPRegistrySearchResult {
  /**
   * List of matching EEP publisher entries.
   */
  results: RegistryEntry[];
  /**
   * Total number of entities matching the query.
   */
  total: number;
  /**
   * Current page number (1-indexed).
   */
  page: number;
  /**
   * Number of results per page.
   */
  per_page: number;
  /**
   * Opaque cursor for fetching the next page. Absent when on the last page.
   */
  next_cursor?: string;
  /**
   * Unique identifier for this paginated query session. Pass as ?query_id=... to retrieve subsequent pages.
   */
  query_id?: string;
  /**
   * List of registry DIDs that contributed results (eep.dev + any federated registries consulted).
   */
  resolved_from?: string[];
}
/**
 * A single EEP publisher entry returned from the registry search.
 */
export interface RegistryEntry {
  /**
   * W3C DID of the EEP publisher.
   */
  did: string;
  /**
   * Human-readable display name of the entity.
   */
  name?: string;
  /**
   * URL of the entity's /.well-known/eep.json manifest.
   */
  manifest_url: string;
  /**
   * The EEP conformance tier the publisher holds (per their EEPConformanceCredential). Agents can filter by this field.
   */
  conformance_tier: 'Core' | 'Standard' | 'Full' | 'unverified';
  /**
   * Registry-assigned trust score from 0.0 to 1.0. Computed from conformance credential freshness, DID document age, signed exchange history, and reputation signals. Agents can filter discovery queries by minimum trust score threshold.
   */
  trust_score: number;
  /**
   * Semantic category tags declared by the publisher. Used for filtered discovery queries (e.g., ?category=supply-chain).
   */
  categories?: string[];
  /**
   * Gate requirement types supported by this publisher. Agents filter by gate type when selecting interaction partners (e.g., ?gate=payment).
   */
  gate_types?: (
    'credential' | 'identity' | 'agreement' | 'data_request' | 'payment' | 'combined' | 'proof_of_intent' | 'public'
  )[];
  /**
   * Protocol layers supported. Agents filter by layer capability (e.g., ?supports=sse).
   */
  layers?: ('layer1' | 'sse' | 'webhook' | 'websocket')[];
  /**
   * MIME types the publisher can return.
   */
  content_types?: string[];
  /**
   * ISO 8601 UTC timestamp when the entity registered with this registry.
   */
  registered_at: string;
  /**
   * ISO 8601 UTC timestamp when the publisher's EEP Conformance Credential expires. Absent if unverified.
   */
  conformance_credential_expires_at?: string;
  /**
   * Sector-specific conformance extensions the publisher has passed (e.g., EEP-FinServ-1.0).
   */
  sector_extensions?: string[];
  /**
   * Data residency constraint declared by the publisher (e.g., EU-only, US, Worldwide). Agents in regulated environments can filter by this field.
   */
  data_residency?: string;
  /**
   * DID of the registry that indexed this entry. For federated results, this may differ from eep.dev.
   */
  registry_source?: string;
}

// ────────────────────────────────────────────────────────
// service.listing.json
// ────────────────────────────────────────────────────────
/**
 * Schema for an entity's service catalog. Entities publish machine-readable service listings that agents can discover, compare, and purchase. Service names, categories, pricing, and availability are fully entity-defined. The protocol defines the envelope; the content is up to the implementer.
 */
export interface EEPServiceListing {
  /**
   * The DID of the entity offering these services.
   */
  entity_did: string;
  /**
   * List of services offered by this entity.
   *
   * @maxItems 100
   */
  services: Service[];
}
export interface Service {
  /**
   * Unique service identifier within this entity.
   */
  id: string;
  /**
   * Human-readable service name (entity-defined).
   */
  name: string;
  /**
   * Detailed description of what the service provides.
   */
  description?: string;
  /**
   * Service category. Standard categories are suggested but any string is accepted. Agents match on tags and text search, not just category enums.
   */
  category: string;
  /**
   * Entity-defined tags for discovery. Used in search queries.
   *
   * @maxItems 20
   */
  tags?:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string
      ];
  /**
   * Pricing for this service. Uses the same pricing model schema as commerce negotiations.
   */
  pricing: {
    model: string;
    amount?: number;
    currency: string;
    period?: 'hour' | 'day' | 'week' | 'month' | 'year';
    unit?: string;
    rate?: number;
  };
  /**
   * When this service is available.
   */
  availability?: {
    /**
     * Availability mode.
     */
    type?: 'always' | 'schedule' | 'on_demand' | 'limited';
    /**
     * IANA timezone for schedule-based availability.
     */
    timezone?: string;
    /**
     * Weekly schedule (for 'schedule' type). Keys are day abbreviations.
     */
    schedule?: {
      /**
       * This interface was referenced by `undefined`'s JSON-Schema definition
       * via the `patternProperty` "^(mon|tue|wed|thu|fri|sat|sun)$".
       */
      [k: string]: {
        start?: string;
        end?: string;
      }[];
    };
    /**
     * Remaining slots for 'limited' type.
     */
    slots_remaining?: number;
    /**
     * Next available time (ISO 8601).
     */
    next_available?: string;
  };
  /**
   * How the service is delivered after purchase.
   */
  delivery: 'realtime' | 'async' | 'scheduled' | 'sse' | 'webhook' | 'download' | 'a2a_task';
  /**
   * Optional additional requirements beyond payment to access this service. Uses the same requirement types as gate configuration.
   *
   * @maxItems 5
   */
  gate_requirements?:
    | []
    | [
        {
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          type: string;
          [k: string]: unknown | undefined;
        }
      ];
  /**
   * Whether the entity is open to price negotiation via commerce messages.
   */
  negotiable?: boolean;
  rating?: Rating;
  /**
   * Listing status.
   */
  status?: 'active' | 'paused' | 'sold_out' | 'coming_soon';
  created_at?: string;
  updated_at?: string;
  /**
   * Entity-defined metadata.
   */
  metadata?: {
    [k: string]: unknown | undefined;
  };
}
/**
 * Aggregated rating for this service.
 */
export interface Rating {
  /**
   * Average rating score (1.0 to 5.0).
   */
  score?: number;
  /**
   * Total number of reviews.
   */
  count?: number;
}

// ────────────────────────────────────────────────────────
// session.token.json
// ────────────────────────────────────────────────────────
/**
 * Signed session token issued by a publisher after successful gate requirement satisfaction. Presented via Authorization: EEP-Session <token> header on subsequent requests. (§6, Whitepaper).
 */
export interface EEPSessionToken {
  /**
   * DID of the agent this session token is bound to. Must match the presenting agent's DID key.
   */
  agent_did: string;
  /**
   * DID of the publisher that issued this session token. Used for signature verification.
   */
  issuer_did: string;
  /**
   * Gate tiers the agent has been granted access to.
   *
   * @minItems 1
   */
  tiers: [string, ...string[]];
  /**
   * Issued-at time as UNIX timestamp (seconds).
   */
  iat: number;
  /**
   * Expiry time as UNIX timestamp (seconds). Must be greater than iat.
   */
  exp: number;
  /**
   * UNIX timestamp before which the agent should proactively request renewal. Typically exp minus 10% of the session duration.
   */
  refresh_threshold?: number;
  /**
   * Opaque identifier the agent can use to resume interrupted operations, such as replaying missed events from a specific SSE position.
   */
  context_id?: string;
  /**
   * Version of the gate configuration at the time this token was issued. Allows the publisher to detect config changes on renewal.
   */
  gate_version?: string;
  /**
   * EdDSA signature (base64url) over a canonical JSON serialization of all fields except 'signature', keyed to issuer_did's verification key.
   */
  signature: string;
}

// ────────────────────────────────────────────────────────
// subscription.request.json
// ────────────────────────────────────────────────────────
/**
 * Schema for creating a new EEP event subscription. Validates the POST body sent to /eep/subscribe.
 */
export interface EEPSubscriptionRequest {
  /**
   * The DID or URI of the entity to subscribe to. Must be a valid DID (e.g., 'did:web:example.com:u:acme-corp') or an entity URI.
   */
  source_did: string;
  /**
   * List of event type patterns to subscribe to. Supports wildcard suffix (e.g., 'com.example.entity.*'). An empty array is not allowed.
   *
   * @minItems 1
   * @maxItems 50
   */
  event_types: [string, ...string[]];
  /**
   * How events should be delivered to the subscriber.
   */
  delivery_method: 'webhook' | 'sse';
  /**
   * The HTTPS URL where webhook events will be POSTed. Required when delivery_method is 'webhook'. Must be a publicly accessible HTTPS endpoint.
   */
  delivery_url?: string;
  /**
   * The event envelope format for delivery. Defaults to CloudEvents v1.0.
   */
  delivery_format?: 'cloudevents/v1.0';
  /**
   * Optional. Requested subscription lifetime in seconds, starting from successful intent verification (SPECIFICATION.md §10.2). The publisher MAY clamp this to its own policy and reports the value actually granted as `expires_at` on the subscription. Omit to accept the publisher's default lease.
   */
  lease_seconds?: number;
  /**
   * Optional subscriber-defined metadata attached to this subscription for internal tracking.
   */
  metadata?: {
    [k: string]: string | undefined;
  };
  /**
   * Optional. The access tier being requested. If the entity has gate configuration, this specifies which tier the subscriber wants. When omitted, the entity's default_tier is used.
   */
  tier?: string;
  /**
   * Optional. Array of proof objects that satisfy the tier's requirements. See gate.proof.json for the full proof schema. Only needed when subscribing to a gated tier.
   *
   * @maxItems 10
   */
  gate_proofs?:
    | []
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ]
    | [
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        },
        {
          /**
           * Proof type matching a requirement type.
           */
          type: string;
          [k: string]: unknown | undefined;
        }
      ];
}

// ────────────────────────────────────────────────────────
// ws-message.json
// ────────────────────────────────────────────────────────
/**
 * Schema for all messages sent over the EEP Network Pulse (WebSocket) layer. Both client-to-server and server-to-client messages MUST conform to this schema. See SPECIFICATION.md §6.
 */
export type EEPWebSocketMessage = {
  [k: string]: unknown | undefined;
} & {
  /**
   * Protocol version. Clients MUST disconnect if they receive a version they do not support.
   */
  v: 1;
  /**
   * The message category.
   */
  type: 'entity' | 'a2a' | 'system' | 'chat' | 'commerce';
  /**
   * The specific action within the message type.
   */
  action: string;
  /**
   * Monotonically increasing sequence number per channel. Used for ordering and gap detection. See SPECIFICATION.md §6.3.
   */
  seq?: number;
  /**
   * The message payload. Structure varies by type and action.
   */
  data?: {};
  /**
   * Error details, present only in system.error messages.
   */
  error?: {
    /**
     * Machine-readable error code.
     */
    code: string;
    /**
     * Human-readable error description.
     */
    message: string;
  };
  [k: string]: unknown | undefined;
};

