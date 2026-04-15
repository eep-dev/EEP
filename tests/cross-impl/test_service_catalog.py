# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-implementation tests: Service catalog endpoint."""

import httpx


class TestServiceCatalog:
    """GET /eep/services/:did — must return a valid service catalog."""

    def test_returns_200(self, client: httpx.Client, test_did: str):
        r = client.get(f"/eep/services/{test_did}")
        assert r.status_code == 200

    def test_has_entity_did(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/services/{test_did}").json()
        assert "entity_did" in data
        assert isinstance(data["entity_did"], str)

    def test_has_services_array(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/services/{test_did}").json()
        assert "services" in data
        assert isinstance(data["services"], list)

    def test_each_service_has_required_fields(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/services/{test_did}").json()
        for i, svc in enumerate(data.get("services", [])):
            assert "id" in svc, f"services[{i}] missing id"
            assert "name" in svc, f"services[{i}] missing name"
            assert "category" in svc, f"services[{i}] missing category"
            assert "pricing" in svc, f"services[{i}] missing pricing"
            assert "delivery" in svc, f"services[{i}] missing delivery"

    def test_pricing_has_model_and_currency(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/services/{test_did}").json()
        for i, svc in enumerate(data.get("services", [])):
            pricing = svc.get("pricing", {})
            assert "model" in pricing, f"services[{i}].pricing missing model"
            assert "currency" in pricing, f"services[{i}].pricing missing currency"

    def test_service_ids_are_unique(self, client: httpx.Client, test_did: str):
        data = client.get(f"/eep/services/{test_did}").json()
        ids = [s["id"] for s in data.get("services", []) if "id" in s]
        assert len(ids) == len(set(ids)), "Duplicate service IDs found"
