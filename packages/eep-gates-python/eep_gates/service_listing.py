# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.service_listing — Validate service catalogs and reviews.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Set

from .models import ValidationResult
from .commerce import validate_pricing

_SERVICE_ID_RE = re.compile(r"^svc_[a-zA-Z0-9_]{1,64}$")
_VALID_DELIVERY = frozenset(["realtime", "async", "scheduled", "sse", "webhook", "download", "a2a_task"])
_VALID_STATUSES = frozenset(["active", "paused", "sold_out", "coming_soon"])


def validate_service_listing(listing: Any) -> ValidationResult:
    """Validate a single service listing."""
    errors: List[str] = []

    if not isinstance(listing, dict):
        return ValidationResult(valid=False, errors=["Service listing must be an object"])

    sid = listing.get("id")
    if not isinstance(sid, str) or not _SERVICE_ID_RE.match(sid):
        errors.append("Service id must match pattern svc_[a-zA-Z0-9_]{1,64}")

    name = listing.get("name")
    if not isinstance(name, str) or len(name) == 0 or len(name) > 256:
        errors.append("Service name is required (1-256 chars)")

    category = listing.get("category")
    if not isinstance(category, str) or len(category) == 0 or len(category) > 64:
        errors.append("Service category is required (1-64 chars)")

    pricing = listing.get("pricing")
    if not pricing:
        errors.append("Pricing is required")
    else:
        pr = validate_pricing(pricing)
        errors.extend(f"pricing: {e}" for e in pr.errors)

    delivery = listing.get("delivery")
    if not isinstance(delivery, str):
        errors.append("Delivery method is required")
    elif delivery not in _VALID_DELIVERY:
        errors.append(f"Delivery must be one of: {', '.join(sorted(_VALID_DELIVERY))}")

    tags = listing.get("tags")
    if tags is not None:
        if not isinstance(tags, list):
            errors.append("Tags must be an array")
        elif len(tags) > 20:
            errors.append("Maximum 20 tags allowed")

    status = listing.get("status")
    if status is not None and status not in _VALID_STATUSES:
        errors.append(f"Status must be one of: {', '.join(sorted(_VALID_STATUSES))}")

    neg = listing.get("negotiable")
    if neg is not None and not isinstance(neg, bool):
        errors.append("Negotiable must be a boolean")

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def validate_service_catalog(catalog: Any) -> ValidationResult:
    """Validate a service catalog (entity + services array)."""
    errors: List[str] = []

    if not isinstance(catalog, dict):
        return ValidationResult(valid=False, errors=["Service catalog must be an object"])

    entity_did = catalog.get("entity_did")
    if not isinstance(entity_did, str) or len(entity_did) == 0:
        errors.append("entity_did is required")

    services = catalog.get("services")
    if not isinstance(services, list):
        errors.append("services must be an array")
    else:
        if len(services) > 100:
            errors.append("Maximum 100 services per catalog")

        ids_seen: Set[str] = set()
        for i, svc in enumerate(services):
            result = validate_service_listing(svc)
            errors.extend(f"services[{i}]: {e}" for e in result.errors)

            sid = svc.get("id") if isinstance(svc, dict) else None
            if isinstance(sid, str):
                if sid in ids_seen:
                    errors.append(f'services[{i}]: Duplicate service id "{sid}"')
                ids_seen.add(sid)

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def validate_review(review: Any) -> ValidationResult:
    """Validate a review."""
    errors: List[str] = []

    if not isinstance(review, dict):
        return ValidationResult(valid=False, errors=["Review must be an object"])

    if not isinstance(review.get("reviewer_did"), str) or len(review["reviewer_did"]) == 0:
        errors.append("reviewer_did is required")

    score = review.get("score")
    if not isinstance(score, int) or score < 1 or score > 5:
        errors.append("Score must be an integer 1-5")

    if not isinstance(review.get("service_id"), str) or len(review["service_id"]) == 0:
        errors.append("service_id is required")

    comment = review.get("comment")
    if comment is not None and (not isinstance(comment, str) or len(comment) > 2048):
        errors.append("Comment must be a string, max 2048 chars")

    return ValidationResult(valid=len(errors) == 0, errors=errors)
