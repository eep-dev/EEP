# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.commerce — Negotiation state machine + pricing validation.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List

from .models import TransitionResult, ValidationResult

# ── Negotiation State Machine ──────────────────────────────────────────────────

VALID_TRANSITIONS: Dict[str, List[str]] = {
    "open": ["counter", "accept", "reject", "expire"],
    "countered": ["counter", "accept", "reject", "expire"],
    "accepted": ["invoice", "complete", "dispute"],
    "rejected": [],
    "expired": [],
    "invoiced": ["receipt", "dispute"],
    "paid": ["complete", "dispute"],
    "completed": [],
    "disputed": ["accept", "reject", "complete"],
}

ACTION_RESULTS: Dict[str, str] = {
    "offer": "open",
    "counter": "countered",
    "accept": "accepted",
    "reject": "rejected",
    "expire": "expired",
    "invoice": "invoiced",
    "receipt": "paid",
    "complete": "completed",
    "dispute": "disputed",
}

STANDARD_MODELS = frozenset(
    ["fixed", "per_request", "per_event", "subscription", "metered", "tiered_volume", "free"]
)

_CURRENCY_RE = re.compile(r"^[a-z]{3}$")
_NEG_ID_RE = re.compile(r"^neg_[a-zA-Z0-9]{8,32}$")


def transition(current: str, action: str) -> TransitionResult:
    """Attempt a state transition on a negotiation."""
    allowed = VALID_TRANSITIONS.get(current)

    if allowed is None:
        return TransitionResult(
            valid=False, **{"from": current}, to=current, action=action,
            error=f'Unknown state "{current}"',
        )

    if action not in allowed:
        valid_str = ", ".join(allowed) if allowed else "none"
        return TransitionResult(
            valid=False, **{"from": current}, to=current, action=action,
            error=f'Cannot "{action}" from state "{current}". Valid actions: {valid_str}',
        )

    return TransitionResult(
        valid=True, **{"from": current}, to=ACTION_RESULTS[action], action=action,
    )


def get_valid_actions(status: str) -> List[str]:
    """Get valid actions for a given state."""
    return VALID_TRANSITIONS.get(status, [])


def is_terminal(status: str) -> bool:
    """Check if a negotiation is in a terminal state."""
    actions = VALID_TRANSITIONS.get(status)
    return actions is None or len(actions) == 0


# ── Pricing Validation ─────────────────────────────────────────────────────────


def validate_pricing(pricing: Any) -> ValidationResult:
    """Validate a pricing object."""
    errors: List[str] = []

    if not isinstance(pricing, dict):
        return ValidationResult(valid=False, errors=["Pricing must be an object"])

    model = pricing.get("model")
    if not isinstance(model, str):
        errors.append("Pricing model is required")
    elif model not in STANDARD_MODELS and not model.startswith("x-"):
        errors.append(f'Unknown pricing model "{model}". Use standard models or x- prefix.')

    currency = pricing.get("currency")
    if not isinstance(currency, str) or not _CURRENCY_RE.match(currency):
        errors.append("Currency must be a 3-letter lowercase ISO 4217 code")

    amount = pricing.get("amount")
    if amount is not None and (not isinstance(amount, (int, float)) or amount < 0):
        errors.append("Amount must be a non-negative number")

    if model == "subscription" and not pricing.get("period"):
        errors.append('Subscription model requires a "period" field')

    if model == "metered":
        if not pricing.get("unit"):
            errors.append('Metered model requires a "unit" field')
        rate = pricing.get("rate")
        if not isinstance(rate, (int, float)) or rate < 0:
            errors.append('Metered model requires a non-negative "rate"')

    if model == "tiered_volume":
        tiers = pricing.get("tiers")
        if not isinstance(tiers, list) or len(tiers) == 0:
            errors.append('Tiered volume model requires a non-empty "tiers" array')

    min_c = pricing.get("minimum_charge")
    max_c = pricing.get("maximum_charge")
    if isinstance(min_c, (int, float)) and isinstance(max_c, (int, float)):
        if min_c > max_c:
            errors.append("minimum_charge cannot exceed maximum_charge")

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def validate_negotiation_envelope(data: Any) -> ValidationResult:
    """Validate a commerce negotiation envelope."""
    errors: List[str] = []

    if not isinstance(data, dict):
        return ValidationResult(valid=False, errors=["Negotiation data must be an object"])

    neg_id = data.get("negotiation_id")
    if not isinstance(neg_id, str) or not _NEG_ID_RE.match(neg_id):
        errors.append("negotiation_id must match pattern neg_[a-zA-Z0-9]{8,32}")

    service = data.get("service")
    if not isinstance(service, str) or len(service) == 0:
        errors.append("service is required")

    if data.get("pricing"):
        pricing_result = validate_pricing(data["pricing"])
        errors.extend(pricing_result.errors)

    if data.get("terms") and not isinstance(data["terms"], dict):
        errors.append("terms must be an object")

    return ValidationResult(valid=len(errors) == 0, errors=errors)
