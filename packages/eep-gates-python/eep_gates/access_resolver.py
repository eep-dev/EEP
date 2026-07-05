# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.access_resolver — Determines which tier an agent has access to.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from .models import AccessResult, UnmetRequirement
from .resource_matcher import matches_any, best_specificity_for
from .proof_validator import validate_proof_structure, ProofVerifierRegistry


async def resolve_access(
    proofs: List[Dict[str, Any]],
    config: Any,
    resource: Optional[str] = None,
    verifier_registry: Optional[ProofVerifierRegistry] = None,
    strict_semantic_verification: bool = True,
) -> AccessResult:
    """Resolve which tier a set of proofs grants access to."""
    # Group proofs by type
    proofs_by_type: Dict[str, List[Dict[str, Any]]] = {}
    for proof in proofs:
        t = proof.get("type", "")
        proofs_by_type.setdefault(t, []).append(proof)

    tiers = config.tiers if hasattr(config, "tiers") else config.get("tiers", {})
    default_tier = config.default_tier if hasattr(config, "default_tier") else config.get("default_tier", "")

    best_tier = default_tier
    best_access_count = 0

    for tier_key, tier in tiers.items():
        if tier_key == default_tier:
            continue

        tier_reqs = tier.requirements if hasattr(tier, "requirements") else tier.get("requirements", [])
        tier_access = tier.access if hasattr(tier, "access") else tier.get("access", [])

        if len(tier_reqs) == 0:
            continue

        if resource and not matches_any(tier_access, resource):
            continue

        reqs_as_dicts = [r.model_dump() if hasattr(r, "model_dump") else r for r in tier_reqs]
        unmet = await _check_requirements(
            reqs_as_dicts,
            proofs_by_type,
            verifier_registry,
            strict_semantic_verification,
        )

        if len(unmet) == 0:
            access_count = float("inf") if "*" in tier_access else len(tier_access)
            if access_count > best_access_count:
                best_tier = tier_key
                best_access_count = access_count

    if resource:
        best_tier_obj = tiers.get(best_tier) if isinstance(tiers, dict) else tiers.get(best_tier)
        if best_tier_obj:
            bt_access = best_tier_obj.access if hasattr(best_tier_obj, "access") else best_tier_obj.get("access", [])
            if matches_any(bt_access, resource):
                # Specificity override. Reaching here with ``best_tier`` still
                # equal to the default tier means no gated (requirements-bearing)
                # tier was satisfied. The default tier must NOT grant the resource
                # through a broad wildcard (e.g. "content.*") when a gated tier
                # targets the same resource with an equal-or-more-specific pattern
                # (e.g. "content.premium.*"); otherwise the broad public grant
                # silently bypasses the gate. Deny and surface the gated tier's
                # unmet requirements instead.
                if best_tier == default_tier and default_tier_overridden_by_gated_tier(config, resource):
                    unmet_for_resource = await _get_unmet_for_resource(
                        config, resource, proofs_by_type, verifier_registry, strict_semantic_verification
                    )
                    return AccessResult(granted=False, tier=best_tier, unmet=unmet_for_resource)
                return AccessResult(granted=True, tier=best_tier, unmet=[])

        unmet_for_resource = await _get_unmet_for_resource(
            config, resource, proofs_by_type, verifier_registry, strict_semantic_verification
        )
        return AccessResult(granted=False, tier=best_tier, unmet=unmet_for_resource)

    return AccessResult(granted=True, tier=best_tier, unmet=[])


def default_tier_overridden_by_gated_tier(config: Any, resource: str) -> bool:
    """Decide whether the default tier's grant of ``resource`` must be suppressed
    because a gated, non-default tier targets the same resource with an
    equal-or-more-specific access pattern.

    Gate configs are commonly shaped so the default tier publishes a broad scope
    and a gated tier carves out a more specific path::

        default "public": access = ["content.*", "profile.*"]
        "paid":            access = ["content.premium.*"], requirements = [...]

    Here ``content.*`` in the public tier covers ``content.premium.X``, so a
    request with no proofs would otherwise leak through the default tier. The
    owner's intent is "premium is more specific than public, so it gates" — this
    returns ``True`` in that case so the resolver denies and emits a 402 instead.

    The default's grant is suppressed when a gated tier's best matching pattern
    is at least as specific as the default tier's best match. A *strictly more
    specific* default pattern keeps its grant (the owner explicitly opened that
    narrower path), and a resource the default tier does not cover at all is
    treated as authoritatively owned by the gated tier (fail closed).
    """
    tiers = config.tiers if hasattr(config, "tiers") else config.get("tiers", {})
    default_tier = config.default_tier if hasattr(config, "default_tier") else config.get("default_tier", "")

    default_tier_obj = tiers.get(default_tier)
    if not default_tier_obj:
        return True

    default_access = default_tier_obj.access if hasattr(default_tier_obj, "access") else default_tier_obj.get("access", [])
    default_best = best_specificity_for(default_access, resource)
    if default_best < 0:
        return True

    for tier_key, tier in tiers.items():
        if tier_key == default_tier:
            continue
        # A non-default tier with no requirements is just another free tier; it
        # does not gate anything, so it cannot override the default's grant.
        tier_reqs = tier.requirements if hasattr(tier, "requirements") else tier.get("requirements", [])
        if not tier_reqs:
            continue

        tier_access = tier.access if hasattr(tier, "access") else tier.get("access", [])
        gated_best = best_specificity_for(tier_access, resource)
        if gated_best < 0:
            continue

        # At least as specific as the default's best match: the gated tier wins,
        # so the default tier must not bypass its requirements.
        if gated_best >= default_best:
            return True

    return False


async def _check_one_requirement(
    req: Dict[str, Any],
    proofs_by_type: Dict[str, List[Dict[str, Any]]],
    verifier_registry: Optional[ProofVerifierRegistry] = None,
    strict_semantic_verification: bool = True,
) -> List[UnmetRequirement]:
    req_type = req.get("type", "")
    if req_type == "combined":
        nested_reqs = req.get("requirements", [])
        if not isinstance(nested_reqs, list):
            return [_requirement_to_unmet(req)]
        nested_results = [
            await _check_one_requirement(
                sub if isinstance(sub, dict) else sub.model_dump(),
                proofs_by_type,
                verifier_registry,
                strict_semantic_verification,
            )
            for sub in nested_reqs
        ]
        mode = req.get("combine_mode", "all")
        if mode == "all":
            out: List[UnmetRequirement] = []
            for part in nested_results:
                out.extend(part)
            return out
        if any(len(part) == 0 for part in nested_results):
            return []
        out = []
        for part in nested_results:
            out.extend(part)
        return out

    type_proofs = proofs_by_type.get(req_type, [])

    if not type_proofs:
        return [_requirement_to_unmet(req)]

    structurally_valid = False
    for proof in type_proofs:
        result = validate_proof_structure(proof)
        if result.valid:
            structurally_valid = True
            if verifier_registry and verifier_registry.has_verifier(req_type):
                semantic_valid = await verifier_registry.verify(proof, req)
                if semantic_valid:
                    structurally_valid = True
                    break
                structurally_valid = False
            else:
                if strict_semantic_verification:
                    structurally_valid = False
                    continue
                break

    if not structurally_valid:
        return [_requirement_to_unmet(req)]

    return []


async def _check_requirements(
    requirements: List[Dict[str, Any]],
    proofs_by_type: Dict[str, List[Dict[str, Any]]],
    verifier_registry: Optional[ProofVerifierRegistry] = None,
    strict_semantic_verification: bool = True,
) -> List[UnmetRequirement]:
    """Check which requirements are NOT satisfied by the provided proofs."""
    unmet: List[UnmetRequirement] = []

    for req in requirements:
        part = await _check_one_requirement(
            req, proofs_by_type, verifier_registry, strict_semantic_verification
        )
        unmet.extend(part)

    return unmet


async def _get_unmet_for_resource(
    config: Any,
    resource: str,
    proofs_by_type: Dict[str, List[Dict[str, Any]]],
    verifier_registry: Optional[ProofVerifierRegistry] = None,
    strict_semantic_verification: bool = True,
) -> List[UnmetRequirement]:
    """For a denied resource, find unmet requirements across tiers that could grant access."""
    tiers = config.tiers if hasattr(config, "tiers") else config.get("tiers", {})
    best_unmet: Optional[List[UnmetRequirement]] = None

    for tier in tiers.values():
        tier_access = tier.access if hasattr(tier, "access") else tier.get("access", [])
        tier_reqs = tier.requirements if hasattr(tier, "requirements") else tier.get("requirements", [])

        if not matches_any(tier_access, resource):
            continue
        if len(tier_reqs) == 0:
            continue

        reqs_as_dicts = [r.model_dump() if hasattr(r, "model_dump") else r for r in tier_reqs]
        unmet = await _check_requirements(
            reqs_as_dicts,
            proofs_by_type,
            verifier_registry,
            strict_semantic_verification,
        )
        if best_unmet is None or len(unmet) < len(best_unmet):
            best_unmet = unmet

    return best_unmet or []


def _requirement_to_unmet(req: Dict[str, Any]) -> UnmetRequirement:
    """Convert a requirement to an unmet requirement with resolution hint."""
    req_type = req.get("type", "")
    hint = ""

    if req_type == "payment":
        hint = f"Payment required: {req.get('amount')} {req.get('currency')} per {req.get('per')}"
    elif req_type == "trust":
        hint = f"Minimum trust score of {req.get('min_score')} required"
    elif req_type == "identity":
        hint = f"Identity verification required: {req.get('method')}"
    elif req_type == "connection":
        hint = f"Social connection required: {req.get('relation')}"
    elif req_type == "credential":
        hint = f"Verifiable Credential required: {req.get('credential_type')}"
        if req.get("issuer"):
            hint += f" from {req['issuer']}"
    elif req_type == "capability":
        caps = req.get("required_capabilities", [])
        hint = f"Agent capabilities required: {', '.join(caps)}"
    elif req_type == "allowlist":
        hint = "Your DID must be on the entity's allowlist"
    elif req_type == "reciprocal":
        hint = f'Reciprocal access of "{req.get("access_level")}" must be granted back'
    elif req_type == "combined":
        hint = f'Combined gate ({req.get("combine_mode")}): satisfy nested requirements'
    else:
        hint = f'Requirement of type "{req_type}" not satisfied'

    return UnmetRequirement(type=req_type, resolution_hint=hint)
