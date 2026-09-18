from typing import Any, Dict, List

import pytest

from eep_gates import ProofVerifier
from eep_middleware.core import (
    DEFAULT_LEASE_SECONDS,
    MAX_LEASE_SECONDS,
    MIN_LEASE_SECONDS,
    EEPServer,
    clamp_lease_seconds,
)


class _PaymentVerifier(ProofVerifier):
    """Test verifier that only accepts the sentinel token ``tok_valid``.

    Mirrors the ``paymentVerifier`` in the TypeScript ``eep-server.test.ts``: a
    payment proof is semantically valid only when the platform confirms it.
    """

    @property
    def supported_types(self) -> List[str]:
        return ["payment"]

    async def verify(self, proof: Dict[str, Any], requirement: Dict[str, Any]) -> bool:
        return proof.get("token") == "tok_valid"


_GATED_CONFIG = {
    "default_tier": "public",
    "tiers": {
        "public": {"requirements": [], "access": ["entity.public.profile"]},
        "premium": {
            "requirements": [{"type": "payment", "amount": 1, "currency": "usd", "per": "request"}],
            "access": ["content.papers.full_text"],
        },
    },
}


@pytest.mark.asyncio
async def test_manifest_and_entity_payloads() -> None:
    server = EEPServer(base_url="https://api.example.com/", did="did:web:example.com")
    manifest = server.manifest_payload()
    assert manifest["did"] == "did:web:example.com"
    assert manifest["layers"]["layer3_ws"] == "wss://api.example.com/eep/pulse"

    entity = server.entity_payload("u", "alice")
    assert entity["did"] == "did:web:example.com:u:alice"
    assert server.entity_payload()["id"] == "default"


@pytest.mark.asyncio
async def test_public_resource_is_granted_without_proofs() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.resolve_gated_resource(None, {})
    assert status == 200
    assert body["tier"] == "public"


@pytest.mark.asyncio
async def test_gated_resource_denied_without_proofs() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.resolve_gated_resource("content.papers.full_text", {})
    assert status == 402
    assert body["error"] == "access_restricted"


@pytest.mark.asyncio
async def test_payment_token_alone_does_not_grant_access() -> None:
    """Regression: a bare ``tok_valid`` payment token must NOT bypass gating.

    The previous implementation hard-coded ``token == "tok_valid"`` as a premium
    grant, ignoring the gate config and any semantic verifier — a backdoor that
    handed premium content to anyone who guessed the placeholder string.
    """
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    headers = {"x-eep-proofs": '[{"type":"payment","token":"tok_valid"}]'}
    status, _ = await server.resolve_gated_resource("content.papers.full_text", headers)
    assert status == 402


@pytest.mark.asyncio
async def test_malformed_proofs_are_ignored() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")

    non_list, _ = await server.resolve_gated_resource(
        "content.papers.full_text", {"x-eep-proofs": '{"type":"payment"}'}
    )
    assert non_list == 402

    parse_error, _ = await server.resolve_gated_resource(
        "content.papers.full_text", {"x-eep-proofs": "not-json"}
    )
    assert parse_error == 402


@pytest.mark.asyncio
async def test_configured_gate_grants_access_with_verified_proof() -> None:
    server = EEPServer(
        base_url="https://api.example.com",
        did="did:web:example.com",
        gate_config=_GATED_CONFIG,
        proof_verifiers=[_PaymentVerifier()],
    )
    headers = {"x-eep-proofs": '[{"type":"payment","token":"tok_valid"}]'}
    status, body = await server.resolve_gated_resource("content.papers.full_text", headers)
    assert status == 200
    assert body["tier"] == "premium"


@pytest.mark.asyncio
async def test_gated_tier_denied_when_verifier_rejects_proof() -> None:
    server = EEPServer(
        base_url="https://api.example.com",
        did="did:web:example.com",
        gate_config=_GATED_CONFIG,
        proof_verifiers=[_PaymentVerifier()],
    )
    headers = {"x-eep-proofs": '[{"type":"payment","token":"tok_wrong"}]'}
    status, _ = await server.resolve_gated_resource("content.papers.full_text", headers)
    assert status == 402


@pytest.mark.asyncio
async def test_subscription_requires_source_did_and_method() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.create_subscription({})
    assert status == 400
    assert body["error"] == "invalid_request"


@pytest.mark.asyncio
async def test_webhook_subscription_requires_delivery_url() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.create_subscription(
        {"source_did": "did:web:agent.example", "delivery_method": "webhook"}
    )
    assert status == 400
    assert "delivery_url" in body["message"]


@pytest.mark.asyncio
async def test_webhook_subscription_rejects_ssrf_unsafe_url() -> None:
    """A webhook delivery_url that resolves to a private/loopback address is rejected."""
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.create_subscription(
        {
            "source_did": "did:web:agent.example",
            "delivery_method": "webhook",
            "delivery_url": "https://127.0.0.1/hook",
        }
    )
    assert status == 400
    assert body["error"] == "invalid_request"
    assert "delivery_url" in body["message"]


@pytest.mark.asyncio
async def test_webhook_subscription_accepts_safe_url(monkeypatch: pytest.MonkeyPatch) -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")

    async def _allow(_url: str) -> None:
        return None

    monkeypatch.setattr("eep_middleware.core.validate_ssrf", _allow)
    status, body = await server.create_subscription(
        {
            "source_did": "did:web:agent.example",
            "delivery_method": "webhook",
            "delivery_url": "https://hook.example/notify",
        }
    )
    assert status == 201
    assert body["callback_url"] == "https://hook.example/notify"
    loaded = await server.get_subscription(body["subscription_id"])
    assert loaded is not None
    assert (await server.get_subscription("missing")) is None


@pytest.mark.asyncio
async def test_sse_subscription_skips_ssrf_and_audits() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, _ = await server.create_subscription(
        {"source_did": "did:web:agent.example", "delivery_method": "sse"}
    )
    assert status == 201

    events: list[str] = []
    await server.subscribe_to_events("subscription.*", lambda event: events.append(event.event_type))
    audit = await server.audit_payload()
    assert audit["subscriptions_count"] == 1


# ── Lease lifetime (SPECIFICATION.md §10.2) ───────────────────────────────
#
# `hub.lease_seconds` was advertised during intent verification and never
# enforced, which made it decorative: an abandoned delivery_url received
# traffic forever and a publisher had no defined way to garbage-collect it.


def test_clamp_lease_seconds_defaults_when_absent_or_non_numeric():
    assert clamp_lease_seconds(None) == DEFAULT_LEASE_SECONDS
    assert clamp_lease_seconds("forever") == DEFAULT_LEASE_SECONDS
    # `bool` is an `int` subclass in Python; a flag is not a lease.
    assert clamp_lease_seconds(True) == DEFAULT_LEASE_SECONDS


def test_clamp_lease_seconds_clamps_to_policy_bounds():
    assert clamp_lease_seconds(1) == MIN_LEASE_SECONDS
    assert clamp_lease_seconds(99_999_999) == MAX_LEASE_SECONDS


def test_clamp_lease_seconds_honours_a_value_within_bounds():
    assert clamp_lease_seconds(3600) == 3600
    # Fractional seconds are truncated, not rejected.
    assert clamp_lease_seconds(3600.9) == 3600


@pytest.mark.asyncio
async def test_create_subscription_reports_the_granted_lease():
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    status, body = await server.create_subscription(
        {
            "source_did": "did:web:agent.example",
            "delivery_method": "sse",
            "event_types": ["com.example.entity.updated"],
        }
    )
    assert status == 201
    # A subscription is time-bounded; the publisher reports what it granted.
    assert isinstance(body["expires_at"], str)
    assert body["expires_at"] > body["created_at"]
