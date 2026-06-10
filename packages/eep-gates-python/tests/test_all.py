# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_gates — Python port of @eep-dev/gates."""

import pytest
from eep_gates import (
    # Resource matcher
    match_resource, matches_any, find_tiers_for_resource,
    pattern_specificity, best_specificity_for,
    # Gate config
    parse_gate_config, serialize_gate_config, GateConfigError,
    # Proof validator
    validate_proof_structure, validate_proofs, ProofVerifier, ProofVerifierRegistry,
    # Access resolver
    resolve_access, default_tier_overridden_by_gated_tier,
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


# ── Default-tier wildcard specificity override ────────────────────────────────
#
# The bypass: a default (no-requirements) tier publishes a broad wildcard
# (``content.*``) that *covers* a resource a gated tier targets with a
# strictly-more-specific pattern (``content.premium.*``). Before the fix the
# resolver granted access via the default tier's broad match even when the
# gated tier's requirements were unmet, silently bypassing the gate.

BYPASS_CONFIG = {
    "default_tier": "public",
    "tiers": {
        "public": {"requirements": [], "access": ["content.*", "profile.*"]},
        "paid": {
            "label": "Premium",
            "requirements": [{"type": "trust", "min_score": 20}],
            "access": ["content.premium.*"],
        },
    },
}

EQUAL_SPECIFICITY_CONFIG = {
    "default_tier": "public",
    "tiers": {
        "public": {"requirements": [], "access": ["content.premium.*"]},
        "paid": {
            "requirements": [{"type": "trust", "min_score": 20}],
            "access": ["content.premium.*"],
        },
    },
}


class _AllowVerifier(ProofVerifier):
    @property
    def supported_types(self):
        return ["trust", "payment", "identity", "credential", "connection"]

    async def verify(self, proof, requirement):
        return True


def _allow_registry() -> ProofVerifierRegistry:
    registry = ProofVerifierRegistry()
    registry.register(_AllowVerifier())
    return registry


class TestPatternSpecificity:
    def test_universal_wildcard_is_least_specific(self):
        assert pattern_specificity("*") == 0

    def test_scope_wildcards_ranked_by_length(self):
        assert pattern_specificity("content.*") == len("content.*")
        assert pattern_specificity("content.premium.*") == len("content.premium.*")
        assert pattern_specificity("content.premium.*") > pattern_specificity("content.*")

    def test_exact_patterns_beat_wildcards(self):
        assert pattern_specificity("content.premium.x") == len("content.premium.x") + 1000
        assert pattern_specificity("a") > pattern_specificity("verylongprefix.*")


class TestBestSpecificityFor:
    def test_returns_best_matching_specificity(self):
        assert best_specificity_for(["content.*", "profile.*"], "content.premium.x") == len("content.*")

    def test_prefers_more_specific_match(self):
        assert best_specificity_for(["content.*", "content.premium.*"], "content.premium.x") == len("content.premium.*")

    def test_keeps_higher_score_when_later_pattern_is_less_specific(self):
        # First matching pattern is the most specific; a later, broader match
        # must not lower the running best (exercises the score<=best branch).
        assert best_specificity_for(["content.premium.*", "content.*"], "content.premium.x") == len("content.premium.*")

    def test_returns_negative_one_when_nothing_matches(self):
        assert best_specificity_for(["profile.*", "video.*"], "content.premium.x") == -1

    def test_returns_negative_one_for_empty_list(self):
        assert best_specificity_for([], "content.premium.x") == -1


class TestDefaultTierOverriddenByGatedTier:
    def test_more_specific_gated_tier_overrides(self):
        assert default_tier_overridden_by_gated_tier(BYPASS_CONFIG, "content.premium.x") is True

    def test_equal_specificity_tie_overrides(self):
        assert default_tier_overridden_by_gated_tier(EQUAL_SPECIFICITY_CONFIG, "content.premium.x") is True

    def test_no_gated_tier_covers_resource(self):
        assert default_tier_overridden_by_gated_tier(BYPASS_CONFIG, "content.blog.post") is False

    def test_missing_default_tier_fails_closed(self):
        config = {
            "default_tier": "ghost",
            "tiers": {
                "paid": {"requirements": [{"type": "trust", "min_score": 20}], "access": ["content.premium.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is True

    def test_default_tier_not_covering_resource_fails_closed(self):
        config = {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["profile.*"]},
                "paid": {"requirements": [{"type": "trust", "min_score": 20}], "access": ["content.premium.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is True

    def test_free_non_default_tier_does_not_override(self):
        config = {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["content.*"]},
                "open": {"requirements": [], "access": ["content.premium.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is False

    def test_tier_without_requirements_field_does_not_override(self):
        config = {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["content.*"]},
                "weird": {"access": ["content.premium.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is False

    def test_gated_tier_not_covering_resource_is_ignored(self):
        config = {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["content.*"]},
                "paid": {"requirements": [{"type": "trust", "min_score": 20}], "access": ["video.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is False

    def test_more_specific_default_tier_keeps_grant(self):
        config = {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["content.premium.docs.*"]},
                "paid": {"requirements": [{"type": "trust", "min_score": 20}], "access": ["content.*"]},
            },
        }
        assert default_tier_overridden_by_gated_tier(config, "content.premium.docs.readme") is False

    def test_parsed_model_config_overrides(self):
        config = parse_gate_config(BYPASS_CONFIG)
        assert default_tier_overridden_by_gated_tier(config, "content.premium.x") is True


class TestSpecificityOverrideResolution:
    @pytest.mark.asyncio
    async def test_bypass_resource_is_denied(self):
        result = await resolve_access([], BYPASS_CONFIG, "content.premium.eep-whitepaper")
        assert result.granted is False
        assert result.tier == "public"
        assert any(u.type == "trust" for u in result.unmet)

    @pytest.mark.asyncio
    async def test_bypass_resource_granted_when_requirements_met(self):
        proofs = [{"type": "trust", "self_attested": True}]
        result = await resolve_access(proofs, BYPASS_CONFIG, "content.premium.eep-whitepaper", verifier_registry=_allow_registry())
        assert result.granted is True
        assert result.tier == "paid"

    @pytest.mark.asyncio
    async def test_non_premium_content_stays_public(self):
        result = await resolve_access([], BYPASS_CONFIG, "content.blog.hello-world")
        assert result.granted is True
        assert result.tier == "public"

    @pytest.mark.asyncio
    async def test_default_only_resource_still_granted(self):
        result = await resolve_access([], BYPASS_CONFIG, "profile.bio")
        assert result.granted is True
        assert result.tier == "public"

    @pytest.mark.asyncio
    async def test_equal_specificity_tie_is_denied(self):
        result = await resolve_access([], EQUAL_SPECIFICITY_CONFIG, "content.premium.x")
        assert result.granted is False
        assert result.tier == "public"

    @pytest.mark.asyncio
    async def test_resource_less_resolution_unchanged(self):
        result = await resolve_access([], BYPASS_CONFIG)
        assert result.granted is True
        assert result.tier == "public"
