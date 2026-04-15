"""Operator policy (deterministic; no LLM)."""

SPENDING_POLICY = {
    "max_per_transaction_usd": 1.0,
    "approved_gate_types": ("agreement", "payment", "credential"),
    "auto_sign_agreements": True,
    "max_agreement_retention_days": 90,
}


def payment_allowed(amount_usd: float) -> bool:
    return amount_usd <= SPENDING_POLICY["max_per_transaction_usd"]
