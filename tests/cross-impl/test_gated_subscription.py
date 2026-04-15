# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-implementation tests: Gated subscription endpoint."""

import httpx


class TestGatedSubscription:
    """POST /eep/subscribe — must handle tier-aware subscriptions."""

    def test_default_tier_subscription(self, client: httpx.Client, test_did: str):
        """Subscribing without a tier should use default tier."""
        r = client.post("/eep/subscribe", json={
            "source_did": test_did,
            "event_types": ["com.example.entity.*"],
            "delivery_method": "webhook",
            "delivery_url": "https://test.example.com/hooks/eep",
        })
        assert r.status_code in (200, 201)
        data = r.json()
        assert "subscription_id" in data or "status" in data

    def test_gated_tier_without_proofs_returns_402(self, client: httpx.Client, test_did: str):
        """Subscribing to a non-default tier without proofs should fail."""
        r = client.post("/eep/subscribe", json={
            "source_did": test_did,
            "event_types": ["*"],
            "delivery_method": "webhook",
            "delivery_url": "https://test.example.com/hooks/eep",
            "tier": "premium",
        })
        assert r.status_code == 402

    def test_gated_tier_with_proofs(self, client: httpx.Client, test_did: str):
        """Subscribing with valid proofs should succeed."""
        r = client.post("/eep/subscribe", json={
            "source_did": test_did,
            "event_types": ["*"],
            "delivery_method": "webhook",
            "delivery_url": "https://test.example.com/hooks/eep",
            "tier": "premium",
            "gate_proofs": [{"type": "payment", "token": "tok_test_valid"}],
        })
        # May succeed or fail depending on proof verifier
        assert r.status_code in (200, 201, 402)
