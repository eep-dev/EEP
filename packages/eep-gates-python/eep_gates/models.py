# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.models — Core data models for the EEP Gates system.

Pydantic port of @eep-dev/gates types.ts.
Entity-defined tiers with extensible requirement types.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

# ── Requirement Types ──────────────────────────────────────────────────────────

# Normative per Whitepaper Table 1 (six core gate types)
WHITEPAPER_REQUIREMENT_TYPES = frozenset(
    ["credential", "identity", "agreement", "data_request", "payment", "combined"]
)

# Extension types supported by EEP reference implementations (not required for whitepaper conformance)
EXTENSION_REQUIREMENT_TYPES = frozenset(
    ["trust", "connection", "capability", "allowlist", "reciprocal"]
)

# All accepted standard types (whitepaper + extensions)
STANDARD_REQUIREMENT_TYPES = WHITEPAPER_REQUIREMENT_TYPES | EXTENSION_REQUIREMENT_TYPES

_CUSTOM_RE = re.compile(r"^x-[a-z][a-z0-9_-]*$")


def is_valid_requirement_type(t: str) -> bool:
    return t in STANDARD_REQUIREMENT_TYPES or bool(_CUSTOM_RE.match(t))


# ── Requirements ───────────────────────────────────────────────────────────────


class PaymentRequirement(BaseModel):
    type: Literal["payment"] = "payment"
    amount: float
    currency: str
    per: Literal["request", "hour", "day", "week", "month", "year", "once"]
    payment_methods: Optional[List[str]] = None


class TrustRequirement(BaseModel):
    type: Literal["trust"] = "trust"
    min_score: float


class IdentityRequirement(BaseModel):
    type: Literal["identity"] = "identity"
    method: Literal["did_verified", "email_verified", "domain_verified", "kyc", "any"]


class ConnectionRequirement(BaseModel):
    type: Literal["connection"] = "connection"
    relation: Literal["follower", "following", "mutual", "any"]


class CredentialRequirement(BaseModel):
    type: Literal["credential"] = "credential"
    credential_type: str
    issuer: Optional[str] = None
    accepted_formats: Optional[List[Literal["jwt_vc", "ldp_vc", "sd_jwt_vc"]]] = None


class CapabilityRequirement(BaseModel):
    type: Literal["capability"] = "capability"
    required_capabilities: List[str]


class AgreementRequirement(BaseModel):
    type: Literal["agreement"] = "agreement"
    document_url: str
    document_hash: str  # SHA-256 hex of the agreement document
    signature_algo: str = "EdDSA"  # Signing algorithm expected for proof


class DataRequestClaim(BaseModel):
    name: str  # e.g. "org_type", "jurisdiction"
    optional: bool = False


class DataRequestRequirement(BaseModel):
    type: Literal["data_request"] = "data_request"
    requested_claims: List[DataRequestClaim]
    purpose: Optional[str] = None  # W3C DPV purpose URI e.g. "https://w3id.org/dpv#ServiceProvision"
    retention_days: Optional[int] = None


class AllowlistRequirement(BaseModel):
    type: Literal["allowlist"] = "allowlist"
    dids: List[str]


class ReciprocalRequirement(BaseModel):
    type: Literal["reciprocal"] = "reciprocal"
    access_level: str


class CombinedRequirement(BaseModel):
    """AND/OR bundle of nested requirements (atomic verification)."""

    type: Literal["combined"] = "combined"
    combine_mode: Literal["all", "any"]
    requirements: List[Any]
    recommended_collection_order: Optional[List[str]] = None


class CustomRequirement(BaseModel):
    type: str
    model_config = {"extra": "allow"}

    @field_validator("type")
    @classmethod
    def validate_custom_type(cls, v: str) -> str:
        if not v.startswith("x-"):
            raise ValueError("Custom requirement type must start with 'x-'")
        return v


Requirement = Union[
    PaymentRequirement,
    TrustRequirement,
    IdentityRequirement,
    ConnectionRequirement,
    CredentialRequirement,
    AgreementRequirement,
    DataRequestRequirement,
    CapabilityRequirement,
    AllowlistRequirement,
    ReciprocalRequirement,
    CombinedRequirement,
    CustomRequirement,
]

# ── Rate Limits ────────────────────────────────────────────────────────────────


class RateLimit(BaseModel):
    requests_per_minute: Optional[int] = None
    requests_per_hour: Optional[int] = None
    requests_per_day: Optional[int] = None
    concurrent_connections: Optional[int] = None


# ── Tiers ──────────────────────────────────────────────────────────────────────


class Tier(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    requirements: List[Requirement] = Field(default_factory=list)
    access: List[str] = Field(default_factory=list)
    rate_limit: Optional[RateLimit] = None
    metadata: Optional[Dict[str, Any]] = None


# ── Gate Configuration ─────────────────────────────────────────────────────────


class GateConfig(BaseModel):
    default_tier: str
    tiers: Dict[str, Tier]
    fallback_behavior: Optional[Literal["restrict", "default"]] = None


# ── Proofs ─────────────────────────────────────────────────────────────────────


class BaseProof(BaseModel):
    type: str
    issued_at: Optional[str] = None
    expires_at: Optional[str] = None
    nonce: Optional[str] = None
    model_config = {"extra": "allow"}


class PaymentProof(BaseProof):
    type: Literal["payment"] = "payment"
    token: str
    provider: Optional[str] = None
    tier: Optional[str] = None


class TrustProof(BaseProof):
    type: Literal["trust"] = "trust"
    self_attested: Literal[True] = True


class IdentityProof(BaseProof):
    type: Literal["identity"] = "identity"
    method: str
    evidence: Optional[str] = None


class ConnectionProof(BaseProof):
    type: Literal["connection"] = "connection"
    subscriber_did: str
    relation: Optional[str] = None


class CredentialProof(BaseProof):
    type: Literal["credential"] = "credential"
    credential: str
    format: Literal["jwt_vc", "ldp_vc", "sd_jwt_vc"]


class CapabilityProof(BaseProof):
    type: Literal["capability"] = "capability"
    declared_capabilities: List[str]


class AllowlistProof(BaseProof):
    type: Literal["allowlist"] = "allowlist"
    did: str


class ReciprocalProof(BaseProof):
    type: Literal["reciprocal"] = "reciprocal"
    entity_did: str
    granted_access: str


GateProof = Union[
    PaymentProof,
    TrustProof,
    IdentityProof,
    ConnectionProof,
    CredentialProof,
    CapabilityProof,
    AllowlistProof,
    ReciprocalProof,
    BaseProof,
]

# ── Access Resolution ──────────────────────────────────────────────────────────


class UnmetRequirement(BaseModel):
    type: str
    resolution_hint: Optional[str] = None
    model_config = {"extra": "allow"}


class AccessResult(BaseModel):
    granted: bool
    tier: str
    unmet: List[UnmetRequirement] = Field(default_factory=list)


# ── HTTP 402 Response ──────────────────────────────────────────────────────────


class AccessRestrictionResponse(BaseModel):
    error: Literal["access_restricted"] = "access_restricted"
    resource: str
    current_tier: str
    required_tier: str
    unmet_requirements: List[UnmetRequirement] = Field(default_factory=list)
    available_tiers: Optional[Dict[str, Any]] = None
    gates_config_url: Optional[str] = None
    retry_after: Optional[int] = None


# ── Commerce ───────────────────────────────────────────────────────────────────

STANDARD_PRICING_MODELS = frozenset(
    ["fixed", "per_request", "per_event", "subscription", "metered", "tiered_volume", "free"]
)

NegotiationStatus = Literal[
    "open", "countered", "accepted", "rejected", "expired", "invoiced", "paid", "completed", "disputed"
]

CommerceAction = Literal[
    "offer", "counter", "accept", "reject", "expire", "invoice", "receipt", "complete", "dispute"
]


class PricingTier(BaseModel):
    up_to: Union[int, str]
    rate: float


class Pricing(BaseModel):
    model: str
    amount: Optional[float] = None
    currency: str
    period: Optional[Literal["hour", "day", "week", "month", "year"]] = None
    unit: Optional[str] = None
    rate: Optional[float] = None
    tiers: Optional[List[PricingTier]] = None
    minimum_charge: Optional[float] = None
    maximum_charge: Optional[float] = None


class NegotiationEnvelope(BaseModel):
    negotiation_id: str
    service: str
    pricing: Optional[Pricing] = None
    terms: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    invoice: Optional[Dict[str, Any]] = None
    receipt: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


# ── Service Listing ────────────────────────────────────────────────────────────


class ServiceListing(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    tags: Optional[List[str]] = None
    pricing: Pricing
    availability: Optional[Dict[str, Any]] = None
    delivery: str
    gate_requirements: Optional[List[Requirement]] = None
    negotiable: Optional[bool] = None
    rating: Optional[Dict[str, Any]] = None
    status: Optional[Literal["active", "paused", "sold_out", "coming_soon"]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ServiceCatalog(BaseModel):
    entity_did: str
    services: List[ServiceListing]


class Review(BaseModel):
    id: Optional[str] = None
    reviewer_did: str
    score: int = Field(ge=1, le=5)
    comment: Optional[str] = None
    service_id: str
    created_at: Optional[str] = None


# ── Validation Results ─────────────────────────────────────────────────────────


class ValidationResult(BaseModel):
    valid: bool
    errors: List[str] = Field(default_factory=list)


class TransitionResult(BaseModel):
    valid: bool
    from_status: str = Field(alias="from")
    to: str
    action: str
    error: Optional[str] = None

    model_config = {"populate_by_name": True}
