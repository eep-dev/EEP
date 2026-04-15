# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-implementation tests: Gate configuration endpoint."""

import httpx


class TestGateConfigEndpoint:
    """GET /eep/gates/:did — must return a valid gate config."""

    def test_returns_200(self, client: httpx.Client, test_did: str):
        r = client.get(f"/eep/gates/{test_did}")
        assert r.status_code == 200

    def test_returns_json(self, client: httpx.Client, test_did: str):
        r = client.get(f"/eep/gates/{test_did}")
        data = r.json()
        assert isinstance(data, dict)

    def test_has_default_tier(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/gates/{test_did}").json()
        assert "default_tier" in data
        assert isinstance(data["default_tier"], str)

    def test_has_tiers(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/gates/{test_did}").json()
        assert "tiers" in data
        assert isinstance(data["tiers"], dict)
        assert len(data["tiers"]) >= 1

    def test_default_tier_exists_in_tiers(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/gates/{test_did}").json()
        assert data["default_tier"] in data["tiers"]

    def test_each_tier_has_access(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/gates/{test_did}").json()
        for key, tier in data["tiers"].items():
            assert "access" in tier, f"Tier '{key}' missing access array"
            assert isinstance(tier["access"], list)
            assert len(tier["access"]) >= 1

    def test_each_tier_has_requirements(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/gates/{test_did}").json()
        for key, tier in data["tiers"].items():
            assert "requirements" in tier, f"Tier '{key}' missing requirements"
            assert isinstance(tier["requirements"], list)
