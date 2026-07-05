# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates — Access control, commerce negotiation, and service discovery for EEP.

Python port of @eep-dev/gates (TypeScript).
"""

# ── Models ─────────────────────────────────────────────────────────────────────
from .models import (
    # Requirements
    PaymentRequirement, TrustRequirement, IdentityRequirement,
    ConnectionRequirement, CredentialRequirement, CapabilityRequirement,
    AllowlistRequirement, ReciprocalRequirement, CombinedRequirement, CustomRequirement,
    Requirement,
    # Gate config
    Tier, RateLimit, GateConfig,
    # Proofs
    BaseProof, PaymentProof, TrustProof, IdentityProof, ConnectionProof,
    CredentialProof, CapabilityProof, AllowlistProof, ReciprocalProof, GateProof,
    # Access results
    UnmetRequirement, AccessResult, AccessRestrictionResponse,
    # Commerce
    Pricing, NegotiationEnvelope, ServiceListing, ServiceCatalog, Review,
    # Validation
    ValidationResult, TransitionResult,
)

# ── Gate Config ────────────────────────────────────────────────────────────────
from .gate_config import parse_gate_config, serialize_gate_config, get_used_requirement_types, GateConfigError

# ── Resource Matching ──────────────────────────────────────────────────────────
from .resource_matcher import (
    match_resource, matches_any, find_tiers_for_resource,
    pattern_specificity, best_specificity_for,
)

# ── Access Resolution ──────────────────────────────────────────────────────────
from .access_resolver import resolve_access, default_tier_overridden_by_gated_tier

# ── Proof Validation ───────────────────────────────────────────────────────────
from .proof_validator import (
    validate_proof_structure, validate_proofs, delegation_permits_data_request,
    ProofVerifier, ProofVerifierRegistry,
)

# ── HTTP 402 ───────────────────────────────────────────────────────────────────
from .http_402 import build_402_response, is_gated_resource

# ── Commerce ───────────────────────────────────────────────────────────────────
from .commerce import (
    transition, get_valid_actions, is_terminal,
    validate_pricing, validate_negotiation_envelope,
)

# ── Service Listing ────────────────────────────────────────────────────────────
from .service_listing import validate_service_listing, validate_service_catalog, validate_review

__all__ = [
    # Models
    "PaymentRequirement", "TrustRequirement", "IdentityRequirement",
    "ConnectionRequirement", "CredentialRequirement", "CapabilityRequirement",
    "AllowlistRequirement", "ReciprocalRequirement", "CombinedRequirement", "CustomRequirement",
    "Requirement", "Tier", "RateLimit", "GateConfig",
    "BaseProof", "PaymentProof", "TrustProof", "IdentityProof", "ConnectionProof",
    "CredentialProof", "CapabilityProof", "AllowlistProof", "ReciprocalProof", "GateProof",
    "UnmetRequirement", "AccessResult", "AccessRestrictionResponse",
    "Pricing", "NegotiationEnvelope", "ServiceListing", "ServiceCatalog", "Review",
    "ValidationResult", "TransitionResult",
    # Gate Config
    "parse_gate_config", "serialize_gate_config", "get_used_requirement_types", "GateConfigError",
    # Resource Matching
    "match_resource", "matches_any", "find_tiers_for_resource",
    "pattern_specificity", "best_specificity_for",
    # Access Resolution
    "resolve_access", "default_tier_overridden_by_gated_tier",
    # Proof Validation
    "validate_proof_structure", "validate_proofs", "delegation_permits_data_request",
    "ProofVerifier", "ProofVerifierRegistry",
    # HTTP 402
    "build_402_response", "is_gated_resource",
    # Commerce
    "transition", "get_valid_actions", "is_terminal",
    "validate_pricing", "validate_negotiation_envelope",
    # Service Listing
    "validate_service_listing", "validate_service_catalog", "validate_review",
]
