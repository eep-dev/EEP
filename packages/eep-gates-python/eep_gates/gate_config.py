# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.gate_config — Parse, validate, and serialize EEP gate configurations.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Set

from .models import (
    GateConfig,
    Tier,
    Requirement,
    STANDARD_REQUIREMENT_TYPES,
    is_valid_requirement_type,
)

_TIER_KEY_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
_ACCESS_PATTERN_RE = re.compile(r"^(\*|[a-z][a-z0-9_.]*(\.\*)?)$")
_VALID_IDENTITY_METHODS = frozenset(["did_verified", "email_verified", "domain_verified", "kyc", "any"])
_VALID_CONNECTION_RELATIONS = frozenset(["follower", "following", "mutual", "any"])


class GateConfigError(Exception):
    """Raised when gate config validation fails."""

    def __init__(self, message: str, field: str, code: str) -> None:
        super().__init__(message)
        self.field = field
        self.code = code


# ── Validation helpers ─────────────────────────────────────────────────────────


def _validate_tier_key(key: str) -> None:
    if not _TIER_KEY_RE.match(key):
        raise GateConfigError(
            f"Tier key '{key}' must be lowercase alphanumeric with dashes/underscores (1-64 chars)",
            field=f"tiers.{key}",
            code="INVALID_TIER_KEY",
        )


def _validate_access_pattern(pattern: str, tier_key: str) -> None:
    if not _ACCESS_PATTERN_RE.match(pattern):
        raise GateConfigError(
            f"Access pattern '{pattern}' in tier '{tier_key}' is invalid",
            field=f"tiers.{tier_key}.access",
            code="INVALID_ACCESS_PATTERN",
        )


def _validate_requirement(req: Dict[str, Any], tier_key: str) -> None:
    req_type = req.get("type")
    if not isinstance(req_type, str) or not is_valid_requirement_type(req_type):
        raise GateConfigError(
            f"Unknown requirement type '{req_type}' in tier '{tier_key}'",
            field=f"tiers.{tier_key}.requirements",
            code="INVALID_REQUIREMENT_TYPE",
        )

    if req_type == "payment":
        if not isinstance(req.get("amount"), (int, float)) or req["amount"] < 0:
            raise GateConfigError("Payment amount must be non-negative", field=f"tiers.{tier_key}", code="INVALID_PAYMENT")
        if not isinstance(req.get("currency"), str) or not re.match(r"^[a-z]{3}$", req["currency"]):
            raise GateConfigError("Payment currency must be 3-letter lowercase", field=f"tiers.{tier_key}", code="INVALID_PAYMENT")
    elif req_type == "trust":
        if not isinstance(req.get("min_score"), (int, float)):
            raise GateConfigError("Trust min_score is required", field=f"tiers.{tier_key}", code="INVALID_TRUST")
    elif req_type == "identity":
        if req.get("method") not in _VALID_IDENTITY_METHODS:
            raise GateConfigError("Invalid identity method", field=f"tiers.{tier_key}", code="INVALID_IDENTITY")
    elif req_type == "connection":
        if req.get("relation") not in _VALID_CONNECTION_RELATIONS:
            raise GateConfigError("Invalid connection relation", field=f"tiers.{tier_key}", code="INVALID_CONNECTION")
    elif req_type == "credential":
        if not isinstance(req.get("credential_type"), str):
            raise GateConfigError("credential_type is required", field=f"tiers.{tier_key}", code="INVALID_CREDENTIAL")
    elif req_type == "capability":
        caps = req.get("required_capabilities")
        if not isinstance(caps, list) or len(caps) == 0:
            raise GateConfigError("required_capabilities must be non-empty", field=f"tiers.{tier_key}", code="INVALID_CAPABILITY")
    elif req_type == "allowlist":
        dids = req.get("dids")
        if not isinstance(dids, list) or len(dids) == 0:
            raise GateConfigError("dids must be non-empty array", field=f"tiers.{tier_key}", code="INVALID_ALLOWLIST")
    elif req_type == "reciprocal":
        if not isinstance(req.get("access_level"), str):
            raise GateConfigError("access_level is required", field=f"tiers.{tier_key}", code="INVALID_RECIPROCAL")
    elif req_type == "combined":
        if req.get("combine_mode") not in ("all", "any"):
            raise GateConfigError("combined needs combine_mode all|any", field=f"tiers.{tier_key}", code="INVALID_COMBINED")
        nested = req.get("requirements")
        if not isinstance(nested, list) or len(nested) < 2:
            raise GateConfigError("combined needs at least 2 nested requirements", field=f"tiers.{tier_key}", code="INVALID_COMBINED")
        for sub in nested:
            if isinstance(sub, dict):
                _validate_requirement(sub, tier_key)


def _validate_tier(tier_data: Any, key: str) -> None:
    if not isinstance(tier_data, dict):
        raise GateConfigError(f"Tier '{key}' must be an object", field=f"tiers.{key}", code="INVALID_TIER")

    access = tier_data.get("access")
    if not isinstance(access, list) or len(access) == 0:
        raise GateConfigError(f"Tier '{key}' must have a non-empty access array", field=f"tiers.{key}.access", code="MISSING_ACCESS")

    for pattern in access:
        _validate_access_pattern(pattern, key)

    requirements = tier_data.get("requirements", [])
    if not isinstance(requirements, list):
        raise GateConfigError(f"Requirements in tier '{key}' must be an array", field=f"tiers.{key}.requirements", code="INVALID_REQUIREMENTS")

    for req in requirements:
        _validate_requirement(req, key)


# ── Public API ─────────────────────────────────────────────────────────────────


def parse_gate_config(raw: Any) -> GateConfig:
    """Parse and validate a raw gate configuration object.

    Raises GateConfigError on invalid input.
    """
    if not isinstance(raw, dict):
        raise GateConfigError("Gate config must be an object", field="root", code="INVALID_ROOT")

    default_tier = raw.get("default_tier")
    if not isinstance(default_tier, str):
        raise GateConfigError("default_tier is required", field="default_tier", code="MISSING_DEFAULT_TIER")

    tiers = raw.get("tiers")
    if not isinstance(tiers, dict) or len(tiers) == 0:
        raise GateConfigError("tiers must be a non-empty object", field="tiers", code="MISSING_TIERS")

    if default_tier not in tiers:
        raise GateConfigError(
            f"default_tier '{default_tier}' must exist in tiers",
            field="default_tier",
            code="DEFAULT_TIER_NOT_FOUND",
        )

    for key, tier_data in tiers.items():
        _validate_tier_key(key)
        _validate_tier(tier_data, key)

    return GateConfig(**raw)


def serialize_gate_config(config: GateConfig) -> Dict[str, Any]:
    """Serialize a gate configuration to a plain dict."""
    return config.model_dump(exclude_none=True)


def _collect_req_types(req: Any, into: Set[str]) -> None:
    req_obj = req if isinstance(req, dict) else req.model_dump()
    t = req_obj.get("type", "")
    into.add(t)
    if t == "combined":
        for sub in req_obj.get("requirements", []):
            _collect_req_types(sub, into)


def get_used_requirement_types(config: GateConfig) -> Set[str]:
    """List all requirement types used in a gate configuration."""
    types: Set[str] = set()
    for tier in config.tiers.values():
        for req in tier.requirements:
            _collect_req_types(req, types)
    return types
