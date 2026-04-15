from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from starlette.requests import Request

from eep_api_python.app import BASE_URL, DEMO_AGREEMENT_HASH, _base_url_for_request, app, graduated_trust

client = TestClient(app)
parity = json.loads((Path(__file__).resolve().parents[2] / "parity-fixtures.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _clear_graduated_trust() -> None:
    graduated_trust.clear()
    yield
    graduated_trust.clear()


def test_well_known():
    res = client.get("/.well-known/eep.json")
    assert res.status_code == 200
    body = res.json()
    assert body["eep_version"] == parity["manifest_expect"]["eep_version"]
    assert body["x402_enabled"] == parity["manifest_expect"]["x402_enabled"]
    assert parity["manifest_expect"]["supports_json"] in body["supported_content_types"]
    assert "layer3_ws" in body["layers"]


def test_well_known_uses_host_headers():
    res = client.get(
        "/.well-known/eep.json",
        headers={"host": "api.example.com:8443", "x-forwarded-proto": "https"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["gates_url"].startswith("https://api.example.com:8443/")


def test_registry_manifest_has_economics():
    res = client.get("/.well-known/eep-registry.json")
    assert res.status_code == 200
    data = res.json()
    assert data["economics"]["query_quota"]["free_requests_per_day"] == 1000
    assert "federation_credential_url" in data


def test_subscribe():
    res = client.post("/eep/subscribe", json={"source_did": "did:web:test", "delivery_method": "webhook"})
    assert res.status_code == 200
    assert res.json()["status"] == "pending_verification"


def test_entity_resolution_headers():
    res = client.get("/u/u/acme-corp")
    assert res.status_code == 200
    assert res.headers["EEP-Version"] == "0.1"


def test_entity_fallback_u_slash():
    res = client.get("/u/")
    assert res.status_code == 200
    assert res.json()["id"] == "acme-corp"


def test_services_and_gates():
    services = client.get("/eep/services")
    assert services.status_code == 200
    gates = client.get("/eep/gates")
    assert gates.status_code == 200
    assert "premium_bundle" in gates.json()["tiers"]


def test_healthz():
    res = client.get("/healthz")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["runtime"] == "python"


def test_sse_stream_endpoint():
    res = client.get("/eep/stream")
    assert res.status_code == 200
    assert "event:" in res.text


def test_gated_content():
    denied = client.get("/eep/content/did:web:test/content.papers.full_text")
    assert denied.status_code == parity["gate_expect"]["denied_status"]
    allowed = client.get(
        "/eep/content/did:web:test/content.papers.full_text",
        headers={"x-eep-gate-proofs": '[{"type":"payment","token":"x402"}]'},
    )
    assert allowed.status_code == parity["gate_expect"]["allowed_status"]


def test_combined_bundle_content():
    proofs = [
        {"type": "payment", "token": "x402"},
        {
            "type": "agreement",
            "document_hash": DEMO_AGREEMENT_HASH,
            "document_url": "https://example.com/eep-reference/terms",
            "signature": "dGVzdC1zaWduYXR1cmUxMjM0",  # base64, len >= 10
            "signer_did": "did:key:testsigner",
            "signature_algo": "EdDSA",
        },
    ]
    res = client.get(
        f"/eep/content/did:web:test/{'content.bundle.report'}",
        headers={"x-eep-gate-proofs": json.dumps(proofs)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("combined_gate") is True
    assert "bundle report" in body["content"]


def test_trust_graduate_and_status():
    did = "did:key:z6MkhaXg"
    assert client.get(f"/eep/trust-status?agent_did={did}").json()["trust_state"] == "cold_start"
    r = client.post("/eep/trust/graduate", json={"agent_did": did})
    assert r.status_code == 200
    assert client.get(f"/eep/trust-status?agent_did={did}").json()["trust_state"] == "standard"


def test_trust_graduate_invalid():
    assert client.post("/eep/trust/graduate", json={"agent_did": "not-a-did"}).status_code == 400


def test_trust_status_invalid():
    assert client.get("/eep/trust-status").status_code == 400


def test_trust_header_middleware():
    did = "did:key:trustheader1"
    res = client.get("/healthz", headers={"EEP-Agent-DID": did})
    assert res.headers.get("X-EEP-Trust-State") == "cold_start"
    client.post("/eep/trust/graduate", json={"agent_did": did})
    res2 = client.get("/healthz", headers={"EEP-Agent-DID": did})
    assert res2.headers.get("X-EEP-Trust-State") == "standard"


def test_delegation_verify_ok():
    payload = {
        "credential_subject": {
            "operator_privacy_policy_hash": "pol1",
            "allowed_dpv_purposes": ["analytics"],
            "max_retention_days": 30,
        },
        "data_request_requirement": {
            "type": "data_request",
            "policy_hash": "pol1",
            "requested_claims": [
                {"purpose": "analytics", "claim": "email", "retention_days": 10},
            ],
        },
    }
    res = client.post("/eep/delegation/verify", json=payload)
    assert res.status_code == 200
    assert res.json()["valid"] is True


def test_delegation_verify_policy_mismatch():
    payload = {
        "credential_subject": {"operator_privacy_policy_hash": "a"},
        "data_request_requirement": {
            "type": "data_request",
            "policy_hash": "b",
            "requested_claims": [],
        },
    }
    res = client.post("/eep/delegation/verify", json=payload)
    assert res.status_code == 403


def test_delegation_verify_bad_body():
    res = client.post("/eep/delegation/verify", json={})
    assert res.status_code == 400


def test_websocket():
    with client.websocket_connect("/eep/pulse") as ws:
        first = ws.receive_json()
        assert first["action"] == "connected"
        ws.send_json({"v": 1, "type": "system", "action": "subscribe"})
        second = ws.receive_json()
        assert second["action"] == "subscribed"


def test_websocket_dispute_resolved():
    with client.websocket_connect("/eep/pulse") as ws:
        ws.receive_json()
        ws.send_json(
            {
                "v": 1,
                "type": "commerce",
                "action": "commerce.dispute.open",
                "seq": 5,
                "data": {"negotiation_id": "neg_1"},
            }
        )
        msg = ws.receive_json()
        assert msg["action"] == "commerce.dispute.resolved"
        assert msg["data"]["outcome"] == "dismissed"


def test_not_found():
    assert client.get("/no-such-route-xyz").status_code == 404


def test_base_url_from_eep_public_base_url_env(monkeypatch):
    monkeypatch.setenv("EEP_PUBLIC_BASE_URL", "https://fixed-manifest.example")
    res = client.get("/.well-known/eep.json")
    assert res.status_code == 200
    assert res.json()["gates_url"] == "https://fixed-manifest.example/eep/gates"


def test_base_url_fallback_without_host_header(monkeypatch):
    monkeypatch.delenv("EEP_PUBLIC_BASE_URL", raising=False)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 50000),
        "server": ("127.0.0.1", 80),
    }
    assert _base_url_for_request(Request(scope)) == BASE_URL.rstrip("/")
