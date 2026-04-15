# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.http_402 — Build spec-compliant 402 (Access Restricted) responses.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .models import AccessRestrictionResponse
from .access_resolver import resolve_access
from .resource_matcher import matches_any, find_tiers_for_resource
from .proof_validator import ProofVerifierRegistry


async def build_402_response(
    config: Any,
    resource: str,
    proofs: Optional[List[Dict[str, Any]]] = None,
    gates_config_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a 402 Access Restricted response body."""
    proofs = proofs or []
    access_result = await resolve_access(proofs, config, resource)

    tiers = config.tiers if hasattr(config, "tiers") else config.get("tiers", {})
    default_tier = config.default_tier if hasattr(config, "default_tier") else config.get("default_tier", "")

    # Find best tier that grants this resource
    tiers_dict: Dict[str, Dict] = {}
    for k, v in tiers.items():
        access = v.access if hasattr(v, "access") else v.get("access", [])
        tiers_dict[k] = {"access": access}

    tiers_for_resource = find_tiers_for_resource(tiers_dict, resource)
    required_tier = tiers_for_resource[0] if tiers_for_resource else default_tier

    # Build available_tiers map
    available_tiers: Dict[str, Any] = {}
    for tier_key in tiers_for_resource:
        tier = tiers.get(tier_key)
        if tier is None:
            continue
        tier_reqs = tier.requirements if hasattr(tier, "requirements") else tier.get("requirements", [])
        if len(tier_reqs) > 0:
            tier_label = tier.label if hasattr(tier, "label") else tier.get("label")
            tier_desc = tier.description if hasattr(tier, "description") else tier.get("description")
            tier_access = tier.access if hasattr(tier, "access") else tier.get("access", [])
            reqs_serialized = [r.model_dump() if hasattr(r, "model_dump") else r for r in tier_reqs]
            available_tiers[tier_key] = {
                "label": tier_label,
                "description": tier_desc,
                "requirements": reqs_serialized,
                "access": tier_access,
            }

    response: Dict[str, Any] = {
        "error": "access_restricted",
        "resource": resource,
        "current_tier": access_result.tier,
        "required_tier": required_tier,
        "unmet_requirements": [u.model_dump(exclude_none=True) for u in access_result.unmet],
    }

    if available_tiers:
        response["available_tiers"] = available_tiers
    if gates_config_url:
        response["gates_config_url"] = gates_config_url

    return response


def is_gated_resource(config: Any, resource: str) -> bool:
    """Check if a resource requires gating (not accessible via default tier)."""
    tiers = config.tiers if hasattr(config, "tiers") else config.get("tiers", {})
    default_tier = config.default_tier if hasattr(config, "default_tier") else config.get("default_tier", "")
    dt = tiers.get(default_tier)
    if dt is None:
        return True
    dt_access = dt.access if hasattr(dt, "access") else dt.get("access", [])
    return not matches_any(dt_access, resource)
