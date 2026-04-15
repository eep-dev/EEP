# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_gates — Python port of @eep-dev/gates."""

import pytest
from eep_gates import (
    # Resource matcher
    match_resource, matches_any, find_tiers_for_resource,
    # Gate config
    parse_gate_config, serialize_gate_config, GateConfigError,
    # Proof validator
    validate_proof_structure, validate_proofs, ProofVerifier, ProofVerifierRegistry,
    # Access resolver
    resolve_access,
    # HTTP 402
    build_402_response, is_gated_resource,
    # Commerce
    transition, get_valid_actions, is_terminal,
    validate_pricing, validate_negotiation_envelope,
    # Service listing
    validate_service_listing, validate_service_catalog, validate_review,
)


# ── Resource Matcher ───────────────────────────────────────────────────────────


class TestResourceMatcher:
    def test_wildcard_matches_everything(self):
        assert match_resource("*", "anything.here") is True

    def test_exact_match(self):
        assert match_resource("profile.bio", "profile.bio") is True
        assert match_resource("profile.bio", "profile.skills") is False

    def test_wildcard_suffix(self):
        assert match_resource("profile.*", "profile.bio") is True
        assert match_resource("profile.*", "profile.skills") is True
        assert match_resource("profile.*", "profile.contact.email") is True
        assert match_resource("profile.*", "events.public") is False

    def test_prefix_itself_matches(self):
        assert match_resource("content.*", "content") is True

    def test_matches_any(self):
        patterns = ["events.public", "profile.*"]
        assert matches_any(patterns, "profile.bio") is True
        assert matches_any(patterns, "events.public") is True
        assert matches_any(patterns, "content.papers") is False

    def test_find_tiers_for_resource(self):
        tiers = {
            "public": {"access": ["events.public", "profile.basic"]},
            "verified": {"access": ["profile.*", "content.*"]},
            "premium": {"access": ["*"]},
        }
        result = find_tiers_for_resource(tiers, "content.papers")
        assert "verified" in result
        assert "premium" in result
        assert "public" not in result


# ── Gate Config ────────────────────────────────────────────────────────────────


SAMPLE_CONFIG = {
    "default_tier": "public",
    "tiers": {
        "public": {
            "requirements": [],
            "access": ["events.public", "profile.basic"],
        },
        "verified": {
            "label": "Verified",
            "requirements": [{"type": "identity", "method": "did_verified"}],
            "access": ["profile.*", "content.*"],
        },
        "premium": {
            "label": "Premium",
            "requirements": [
                {"type": "payment", "amount": 10, "currency": "usd", "per": "month"},
            ],
            "access": ["*"],
        },
    },
}


class TestGateConfig:
    def test_parse_valid_config(self):
        config = parse_gate_config(SAMPLE_CONFIG)
        assert config.default_tier == "public"
        assert len(config.tiers) == 3

    def test_serialize_roundtrip(self):
        config = parse_gate_config(SAMPLE_CONFIG)
        serialized = serialize_gate_config(config)
        assert serialized["default_tier"] == "public"

    def test_rejects_missing_default_tier(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({"tiers": {"x": {"access": ["*"], "requirements": []}}})

    def test_rejects_invalid_tier_key(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "UPPER",
                "tiers": {"UPPER": {"access": ["*"], "requirements": []}},
            })

    def test_rejects_missing_access(self):
        with pytest.raises(GateConfigError):
            parse_gate_config({
                "default_tier": "x",
                "tiers": {"x": {"requirements": []}},
            })


# ── Proof Validator ────────────────────────────────────────────────────────────


class TestProofValidator:
    def test_valid_payment_proof(self):
        r = validate_proof_structure({"type": "payment", "token": "tok_abc"})
        assert r.valid is True

    def test_valid_trust_proof(self):
        r = validate_proof_structure({"type": "trust", "self_attested": True})
        assert r.valid is True

    def test_valid_credential_proof(self):
        r = validate_proof_structure({
            "type": "credential",
            "credential": "eyJhbGciOiJFZERTQSJ9.payload.sig",
            "format": "jwt_vc",
        })
        assert r.valid is True

    def test_rejects_missing_type(self):
        r = validate_proof_structure({"token": "tok_abc"})
        assert r.valid is False

    def test_rejects_expired_proof(self):
        r = validate_proof_structure({
            "type": "payment",
            "token": "tok_abc",
            "expires_at": "2020-01-01T00:00:00Z",
        })
        assert r.valid is False
        assert any("expired" in e.lower() for e in r.errors)

    def test_validate_proofs_array(self):
        r = validate_proofs([
            {"type": "payment", "token": "tok_abc"},
            {"type": "trust", "self_attested": True},
        ])
        assert r.valid is True

    def test_rejects_too_many_proofs(self):
        r = validate_proofs([{"type": "payment", "token": f"tok_{i}"} for i in range(11)])
        assert r.valid is False


# ── Access Resolver ────────────────────────────────────────────────────────────


class TestAccessResolver:
    @pytest.fixture
    def config(self):
        return parse_gate_config(SAMPLE_CONFIG)

    @pytest.mark.asyncio
    async def test_no_proofs_gets_default(self, config):
        result = await resolve_access([], config)
        assert result.granted is True
        assert result.tier == "public"

    @pytest.mark.asyncio
    async def test_identity_proof_grants_verified(self, config):
        class AllowVerifier(ProofVerifier):
            @property
            def supported_types(self):
                return ["identity"]

            async def verify(self, proof, requirement):
                return True

        registry = ProofVerifierRegistry()
        registry.register(AllowVerifier())
        proofs = [{"type": "identity", "method": "did_verified"}]
        result = await resolve_access(proofs, config, verifier_registry=registry)
        assert result.tier == "verified"

    @pytest.mark.asyncio
    async def test_resource_access_denied(self, config):
        result = await resolve_access([], config, "content.papers.full_text")
        assert result.granted is False

    @pytest.mark.asyncio
    async def test_resource_access_granted(self, config):
        class AllowVerifier(ProofVerifier):
            @property
            def supported_types(self):
                return ["identity"]

            async def verify(self, proof, requirement):
                return True

        registry = ProofVerifierRegistry()
        registry.register(AllowVerifier())
        proofs = [{"type": "identity", "method": "did_verified"}]
        result = await resolve_access(proofs, config, "content.papers.full_text", verifier_registry=registry)
        assert result.granted is True
        assert result.tier == "verified"

    @pytest.mark.asyncio
    async def test_fail_closed_when_verifier_missing_by_default(self, config):
        proofs = [{"type": "identity", "method": "did_verified"}]
        result = await resolve_access(proofs, config, "content.papers.full_text")
        assert result.granted is False
        assert result.tier == "public"

    @pytest.mark.asyncio
    async def test_explicit_structural_fallback_mode(self, config):
        proofs = [{"type": "identity", "method": "did_verified"}]
        result = await resolve_access(
            proofs,
            config,
            "content.papers.full_text",
            verifier_registry=None,
            strict_semantic_verification=False,
        )
        assert result.granted is True
        assert result.tier == "verified"


# ── HTTP 402 ───────────────────────────────────────────────────────────────────


class TestHttp402:
    @pytest.fixture
    def config(self):
        return parse_gate_config(SAMPLE_CONFIG)

    @pytest.mark.asyncio
    async def test_build_402_response(self, config):
        resp = await build_402_response(config, "content.papers.full_text")
        assert resp["error"] == "access_restricted"
        assert resp["resource"] == "content.papers.full_text"
        assert resp["current_tier"] == "public"

    def test_is_gated_resource(self, config):
        assert is_gated_resource(config, "content.papers") is True
        assert is_gated_resource(config, "events.public") is False


# ── Commerce ───────────────────────────────────────────────────────────────────


class TestCommerce:
    def test_valid_transition(self):
        r = transition("open", "accept")
        assert r.valid is True
        assert r.to == "accepted"

    def test_invalid_transition(self):
        r = transition("rejected", "accept")
        assert r.valid is False

    def test_terminal_states(self):
        assert is_terminal("completed") is True
        assert is_terminal("rejected") is True
        assert is_terminal("open") is False

    def test_valid_actions(self):
        actions = get_valid_actions("open")
        assert "accept" in actions
        assert "counter" in actions

    def test_validate_pricing_fixed(self):
        r = validate_pricing({"model": "fixed", "amount": 100, "currency": "usd"})
        assert r.valid is True

    def test_validate_pricing_subscription_needs_period(self):
        r = validate_pricing({"model": "subscription", "amount": 29, "currency": "usd"})
        assert r.valid is False

    def test_validate_negotiation_envelope(self):
        r = validate_negotiation_envelope({
            "negotiation_id": "neg_01abc2def3",
            "service": "consulting",
            "pricing": {"model": "fixed", "amount": 100, "currency": "usd"},
        })
        assert r.valid is True

    def test_rejects_bad_negotiation_id(self):
        r = validate_negotiation_envelope({
            "negotiation_id": "bad",
            "service": "x",
        })
        assert r.valid is False


# ── Service Listing ────────────────────────────────────────────────────────────


class TestServiceListing:
    def test_valid_listing(self):
        r = validate_service_listing({
            "id": "svc_data_feed",
            "name": "Data Feed",
            "category": "data",
            "pricing": {"model": "fixed", "amount": 10, "currency": "usd"},
            "delivery": "sse",
        })
        assert r.valid is True

    def test_rejects_invalid_id(self):
        r = validate_service_listing({
            "id": "bad",
            "name": "X",
            "category": "data",
            "pricing": {"model": "fixed", "amount": 10, "currency": "usd"},
            "delivery": "sse",
        })
        assert r.valid is False

    def test_valid_catalog(self):
        r = validate_service_catalog({
            "entity_did": "did:web:example.com",
            "services": [{
                "id": "svc_test",
                "name": "Test",
                "category": "test",
                "pricing": {"model": "fixed", "amount": 0, "currency": "usd"},
                "delivery": "webhook",
            }],
        })
        assert r.valid is True

    def test_duplicate_service_ids(self):
        svc = {
            "id": "svc_dup",
            "name": "Dup",
            "category": "test",
            "pricing": {"model": "fixed", "amount": 0, "currency": "usd"},
            "delivery": "webhook",
        }
        r = validate_service_catalog({
            "entity_did": "did:web:example.com",
            "services": [svc, svc],
        })
        assert r.valid is False

    def test_valid_review(self):
        r = validate_review({
            "reviewer_did": "did:web:agent.example.com",
            "score": 5,
            "service_id": "svc_test",
        })
        assert r.valid is True

    def test_rejects_out_of_range_score(self):
        r = validate_review({
            "reviewer_did": "did:web:x",
            "score": 6,
            "service_id": "svc_test",
        })
        assert r.valid is False
