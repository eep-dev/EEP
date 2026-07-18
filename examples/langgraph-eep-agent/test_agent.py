# Copyright 2026 EEP Contributors — Apache-2.0
"""Unit tests for the LangGraph EEP example's gate-challenge parser.

These assert the example parses the *canonical* EEP gate response
(`schemas/v0.1/gate.402-response.json` / `gate.403-response.json`) — an
`unmet_requirements[]` array — rather than a flat `{gate_type, amount,
currency}` object, which earlier revisions wrongly assumed.

Run from this directory: ``python -m pytest test_agent.py``
"""

import agent


def test_parses_canonical_402_payment():
    body = {
        "error": "access_restricted",
        "resource": "content.papers.full_text",
        "current_tier": "free",
        "required_tier": "paid",
        "unmet_requirements": [
            {
                "type": "payment",
                "amount": 0.1,
                "currency": "USD",
                "per": "request",
                "resolution_hint": "Pay $0.10 via the payment_methods URL",
            }
        ],
    }
    result = agent.handle_gate_challenge(402, body)
    assert result is not None
    assert result["resource"] == "content.papers.full_text"
    assert result["required_tier"] == "paid"
    assert len(result["proofs"]) == 1
    assert result["proofs"][0]["type"] == "payment"
    # PaymentProof requires a `token` field.
    assert "token" in result["proofs"][0]


def test_parses_multiple_unmet_requirements():
    body = {
        "error": "access_restricted",
        "resource": "x",
        "current_tier": "public",
        "required_tier": "verified",
        "unmet_requirements": [
            {"type": "agreement", "document_hash": "sha256:deadbeefcafe", "document_url": "https://x/doc"},
            {"type": "credential", "credential_type": "AcademicAffiliation", "accepted_formats": ["ldp_vc"]},
        ],
    }
    result = agent.handle_gate_challenge(402, body)
    by_type = {p["type"]: p for p in result["proofs"]}
    assert set(by_type) == {"agreement", "credential"}
    assert by_type["credential"]["format"] == "ldp_vc"
    assert by_type["agreement"]["document_hash"] == "sha256:deadbeefcafe"


def test_handles_403_access_forbidden():
    body = {
        "error": "access_forbidden",
        "resource": "x",
        "current_tier": "public",
        "required_tier": "member",
        "unmet_requirements": [{"type": "identity", "method": "kyc"}],
    }
    result = agent.handle_gate_challenge(403, body)
    assert result["proofs"][0]["type"] == "identity"
    assert result["proofs"][0]["method"] == "kyc"


def test_ignores_non_gate_error():
    assert agent.handle_gate_challenge(500, {"error": "internal_error"}) is None


def test_no_autosatisfiable_requirements_returns_none():
    body = {
        "error": "access_restricted",
        "resource": "x",
        "current_tier": "a",
        "required_tier": "b",
        "unmet_requirements": [{"type": "x-custom-thing"}],
    }
    assert agent.handle_gate_challenge(402, body) is None
