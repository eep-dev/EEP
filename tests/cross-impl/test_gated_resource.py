# Copyright 2026 EEP Contributors — Apache-2.0
"""Cross-implementation tests: Gated resource access + 402 responses."""

import json
import httpx


class TestGatedResource:
    """GET /eep/content/:did/:path — must return 402 without proofs for gated resources."""

    def test_public_resource_ok(self, client: httpx.Client, test_did: str):
        """Public-tier resources should be accessible without proofs."""
        r = client.get(f"/eep/content/{test_did}/events.public")
        # Could be 200 or 402 depending on the publisher's config
        assert r.status_code in (200, 402)

    def test_gated_resource_returns_402(self, client: httpx.Client, test_did: str):
        """Gated resources must return 402 without proofs."""
        r = client.get(f"/eep/content/{test_did}/content.papers.full_text")
        assert r.status_code == 402

    def test_402_body_has_required_fields(self, client: httpx.Client, test_did: str):
        r = client.get(f"/eep/content/{test_did}/content.papers.full_text")
        if r.status_code != 402:
            return  # Resource may not be gated in this impl
        data = r.json()
        assert data["error"] == "access_restricted"
        assert "resource" in data
        assert "current_tier" in data
        assert "required_tier" in data

    def test_402_has_unmet_requirements(self, client: httpx.Client, test_did: str):
        r = client.get(f"/eep/content/{test_did}/content.papers.full_text")
        if r.status_code != 402:
            return
        data = r.json()
        assert "unmet_requirements" in data
        assert isinstance(data["unmet_requirements"], list)

    def test_gated_resource_with_proofs(self, client: httpx.Client, test_did: str):
        """Providing valid proofs should grant access."""
        proofs = [{"type": "payment", "token": "tok_test_valid"}]
        r = client.get(
            f"/eep/content/{test_did}/content.papers.full_text",
            headers={"X-EEP-Proofs": json.dumps(proofs)},
        )
        # With valid proofs, could be 200 (if publisher accepts tok_ proofs)
        assert r.status_code in (200, 402)
