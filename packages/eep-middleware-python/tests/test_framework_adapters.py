from typing import Any, Dict, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from eep_gates import ProofVerifier
from eep_middleware import create_eep_blueprint, create_eep_router, get_eep_urlpatterns
from eep_middleware.core import EEPServer


class _PaymentVerifier(ProofVerifier):
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
async def test_fastapi_router_endpoints() -> None:
    server = EEPServer(
        base_url="https://api.example.com",
        did="did:web:example.com",
        gate_config=_GATED_CONFIG,
        proof_verifiers=[_PaymentVerifier()],
    )
    app = FastAPI()
    app.include_router(create_eep_router(server))
    client = TestClient(app)

    manifest = client.get("/.well-known/eep.json")
    assert manifest.status_code == 200

    entity = client.get("/u/u/alice")
    assert entity.status_code == 200
    assert entity.headers["EEP-Version"] == "0.1"

    gates = client.get("/eep/gates")
    assert gates.status_code == 200

    services = client.get("/eep/services")
    assert services.status_code == 200

    health = client.get("/healthz")
    assert health.status_code == 200

    stream = client.get("/eep/stream")
    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")

    denied = client.get("/eep/content/content.papers.full_text")
    assert denied.status_code == 402

    granted = client.get(
        "/eep/content/content.papers.full_text",
        headers={"x-eep-proofs": '[{"type":"payment","token":"tok_valid"}]'},
    )
    assert granted.status_code == 200

    bad_sub = client.post("/eep/subscribe", json={})
    assert bad_sub.status_code == 400

    ok_sub = client.post(
        "/eep/subscribe",
        json={"source_did": "did:web:agent.example", "delivery_method": "sse"},
    )
    assert ok_sub.status_code == 201

    audit = client.get("/eep/audit-log")
    assert audit.status_code == 200

    pulse = client.get("/eep/pulse")
    assert pulse.status_code == 426


def test_flask_and_django_adapter_shapes() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
    blueprint = create_eep_blueprint(server)
    assert blueprint["name"] == "eep"
    assert len(blueprint["routes"]) == 10

    patterns = get_eep_urlpatterns(server)
    assert any(item.get("name") == "eep_manifest" for item in patterns if isinstance(item, dict))
    assert patterns[-1]["publisher_did"] == "did:web:example.com"
