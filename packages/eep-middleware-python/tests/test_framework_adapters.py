import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from eep_middleware import create_eep_blueprint, create_eep_router, get_eep_urlpatterns
from eep_middleware.core import EEPServer


@pytest.mark.asyncio
async def test_fastapi_router_endpoints() -> None:
    server = EEPServer(base_url="https://api.example.com", did="did:web:example.com")
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
