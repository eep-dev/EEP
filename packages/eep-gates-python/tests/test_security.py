# Copyright 2026 EEP Contributors — Apache-2.0
"""
Security tests for eep-gates-python — Python port of @eep-dev/gates security.test.ts.

Tests cover:
  - Injection prevention in gate configs
  - Proof replay prevention (expired/future timestamps)
  - Config manipulation protection (uppercase keys, NoSQL injection)
  - Allowlist size limits
  - x402 payment proof structural validation
"""

import pytest
from datetime import datetime, timedelta, timezone
from eep_gates import (
    parse_gate_config,
    validate_proof_structure,
    GateConfigError,
)


class TestProofInjection:
    """Security: Proof Structure Validation."""

    def test_reject_empty_proof(self):
        result = validate_proof_structure({})
        assert result.valid is False

    def test_reject_proof_with_empty_type(self):
        result = validate_proof_structure({"type": "", "token": "tok_valid"})
        assert result.valid is False

    def test_reject_proof_with_none_type(self):
        result = validate_proof_structure({"type": None})
        assert result.valid is False


class TestProofReplay:
    """Security: Proof Replay Prevention."""

    def test_reject_expired_proof(self):
        result = validate_proof_structure({
            "type": "payment",
            "token": "tok_123",
            "expires_at": "2020-01-01T00:00:00Z",
        })
        assert result.valid is False
        assert any("expired" in e.lower() for e in result.errors)


class TestConfigManipulation:
    """Security: Config Manipulation Prevention."""

    def test_reject_uppercase_tier_key(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "free",
                "tiers": {
                    "FREE": {"requirements": [], "access": ["*"]},
                },
            })

    def test_reject_special_chars_in_tier_key(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "free",
                "tiers": {
                    "free$inject": {"requirements": [], "access": ["*"]},
                },
            })

    def test_reject_empty_tiers(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "free",
                "tiers": {},
            })

    def test_reject_nosql_operator_in_requirement(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "free",
                "tiers": {
                    "free": {"requirements": [], "access": ["*"]},
                    "bad": {
                        "requirements": [{"type": "trust", "min_score": {"$gt": 0}}],
                        "access": ["*"],
                    },
                },
            })


class TestAllowlistAbuse:
    """Security: Allowlist Size Limits."""

    def test_reject_oversized_allowlist(self):
        dids = [f"did:web:agent{i}.example.com" for i in range(1001)]
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "free",
                "tiers": {
                    "free": {
                        "requirements": [{"type": "allowlist", "allowed_dids": dids}],
                        "access": ["*"],
                    },
                },
            })


class TestX402PaymentProof:
    """Security: x402 Payment Proof Validation."""

    def test_accept_valid_token_payment(self):
        result = validate_proof_structure({"type": "payment", "token": "tok_stripe_valid"})
        assert result.valid is True

    def test_reject_missing_both_token_and_x402(self):
        result = validate_proof_structure({"type": "payment"})
        assert result.valid is False
