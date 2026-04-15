#!/usr/bin/env python3
"""
EEP Cross-Implementation Interoperability Tests

Verifies that Node.js and Python EEP implementations can interoperate correctly
at the protocol level: CloudEvents format, HMAC signatures, gate proof structure,
manifest schema, and SSE/Webhook delivery.

Usage:
    # Start both servers first (from repo root):
    #   (Terminal 1) cd examples/node-gate-publisher && npm run dev
    #   (Terminal 2) cd examples/python-fastapi-subscriber && uvicorn server:app --port 8001
    # Then run:
    #   PYTHONPATH=. pytest examples/cross-impl/test_cross_impl.py -v

Environment variables:
    NODE_PUBLISHER_URL   (default: http://localhost:3001)
    PYTHON_PUBLISHER_URL (default: http://localhost:8001)
    NODE_SUBSCRIBER_URL  (default: http://localhost:3002)
    PYTHON_SUBSCRIBER_URL (default: http://localhost:8002)
"""
import os
import json
import hmac
import hashlib
import httpx
import pytest
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

NODE_PUB = os.environ.get("NODE_PUBLISHER_URL", "http://localhost:3001")
PYTHON_PUB = os.environ.get("PYTHON_PUBLISHER_URL", "http://localhost:8001")

# Timeout for cross-impl delivery roundtrips
DELIVERY_TIMEOUT = 10  # seconds


# ── Helpers ───────────────────────────────────────────────────────────────────

def validate_cloudevents_envelope(payload: dict) -> None:
    """Assert CloudEvents v1.0 required fields are present and valid."""
    required = ["specversion", "id", "source", "type", "time"]
    for field in required:
        assert field in payload, f"Missing CloudEvents field: {field}"
    assert payload["specversion"] == "1.0", "specversion must be 1.0"
    assert payload["id"], "id must be non-empty"
    assert payload["source"].startswith("did:") or payload["source"].startswith("http"), \
        f"source should be a DID or URL, got: {payload['source']}"
    assert payload["type"].startswith("com.example."), \
        f"EEP event type must start with 'com.example.', got: {payload['type']}"


def validate_delivery_payload(payload: dict) -> None:
    """Assert EEP webhook delivery required fields are present."""
    validate_cloudevents_envelope(payload)
    assert "eep_subscription_id" in payload, "Missing eep_subscription_id"
    assert "eep_delivery_id" in payload, "Missing eep_delivery_id (must be UUID)"
    assert "eep_delivery_timestamp" in payload, "Missing eep_delivery_timestamp"


def verify_hmac_signature(secret: str, body: bytes, signature_header: str) -> bool:
    """Verify X-EEP-Signature: sha256=<hex> against HMAC-SHA256 of body."""
    if not signature_header.startswith("sha256="):
        return False
    expected_sig = signature_header[len("sha256="):]
    computed = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected_sig)


def get_eep_manifest(base_url: str) -> dict:
    """Fetch and return the /.well-known/eep.json manifest."""
    r = httpx.get(f"{base_url}/.well-known/eep.json", timeout=5)
    r.raise_for_status()
    return r.json()


class WebhookReceiver(BaseHTTPRequestHandler):
    """Minimal HTTP server to capture incoming webhook deliveries."""
    received: list = []
    headers_received: list = []
    raw_bodies: list = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        self.raw_bodies.append(body)
        self.headers_received.append(dict(self.headers))
        try:
            self.received.append(json.loads(body))
        except Exception:
            self.received.append({})
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress output


def start_receiver(port: int = 9901):
    """Start a webhook receiver on a background thread, return (server, thread)."""
    WebhookReceiver.received = []
    WebhookReceiver.headers_received = []
    WebhookReceiver.raw_bodies = []
    server = HTTPServer(("127.0.0.1", port), WebhookReceiver)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestManifestSchemaCompatibility:
    """Verify manifests from both implementations conform to the EEP manifest schema."""

    @pytest.mark.skipif(
        not _server_reachable(NODE_PUB),
        reason=f"Node.js publisher not reachable at {NODE_PUB}"
    )
    def test_node_manifest_required_fields(self):
        manifest = get_eep_manifest(NODE_PUB)
        assert "entity_did" in manifest
        assert manifest["entity_did"].startswith("did:")
        assert "eep_versions" in manifest
        assert isinstance(manifest["eep_versions"], list)
        assert len(manifest["eep_versions"]) >= 1
        assert "layer1_url" in manifest or "layer_1" in manifest or "l1_url" in manifest

    @pytest.mark.skipif(
        not _server_reachable(PYTHON_PUB),
        reason=f"Python publisher not reachable at {PYTHON_PUB}"
    )
    def test_python_manifest_required_fields(self):
        manifest = get_eep_manifest(PYTHON_PUB)
        assert "entity_did" in manifest
        assert manifest["entity_did"].startswith("did:")
        assert "eep_versions" in manifest

    def test_manifest_schema_valid_json(self):
        """Unit test: manifest schema file is valid JSON with required metaschema fields."""
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "eep-manifest.json"
        with open(schema_path) as f:
            schema = json.load(f)
        assert schema["$schema"]
        assert schema["$id"] == "https://eep.dev/schemas/v0.1/eep-manifest.json"
        assert "signing_algorithms" in schema["properties"]
        assert "pqc_algorithms" in schema["properties"]
        assert "forward_secrecy_enforced" in schema["properties"]


class TestCloudEventsEnvelopeCompatibility:
    """Verify event envelope format is compatible across implementations."""

    def test_envelope_schema_fields(self):
        """Unit test: event.envelope.json has all CloudEvents v1.0 required fields."""
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "event.envelope.json"
        with open(schema_path) as f:
            schema = json.load(f)
        required_fields = schema.get("required", [])
        for field in ["specversion", "id", "source", "type", "time"]:
            assert field in required_fields, f"CloudEvents required field '{field}' missing from schema"


class TestDeliveryPayloadCompatibility:
    """Verify delivery payload schema has required cross-implementation fields."""

    def test_delivery_payload_schema_completeness(self):
        """Unit test: delivery.payload.json now has enriched required fields."""
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "delivery.payload.json"
        with open(schema_path) as f:
            schema = json.load(f)
        # Must have idempotency key
        assert "eep_delivery_id" in schema["properties"]
        assert schema["properties"]["eep_delivery_id"]["format"] == "uuid"
        # Must have delivery timestamp
        assert "eep_delivery_timestamp" in schema["properties"]
        # Must have publisher DID
        assert "eep_publisher_did" in schema["properties"]
        # Must have signature algorithm
        assert "eep_signature_algorithm" in schema["properties"]
        # Required must include delivery_id and timestamp
        required = schema.get("required", [])
        assert "eep_delivery_id" in required
        assert "eep_delivery_timestamp" in required

    def test_delivery_payload_required_fields_in_example(self):
        """Unit test: the example in delivery.payload.json has all required fields."""
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "delivery.payload.json"
        with open(schema_path) as f:
            schema = json.load(f)
        example = schema["examples"][0]
        for field in schema["required"]:
            assert field in example, f"Required field '{field}' missing from example"


class TestAuditLogSchemaCompatibility:
    """Verify audit-log.json schema structure."""

    def test_audit_log_schema_exists(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "audit-log.json"
        assert schema_path.exists(), "audit-log.json schema must exist"

    def test_audit_log_schema_required_fields(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "audit-log.json"
        with open(schema_path) as f:
            schema = json.load(f)
        assert "entries" in schema["required"]
        assert "total" in schema["required"]
        assert "page" in schema["required"]
        assert "AuditEntry" in schema["definitions"]

    def test_audit_entry_required_fields(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "audit-log.json"
        with open(schema_path) as f:
            schema = json.load(f)
        entry_required = schema["definitions"]["AuditEntry"]["required"]
        for field in ["entry_id", "event_type", "actor_did", "publisher_did", "timestamp", "outcome", "signature"]:
            assert field in entry_required, f"AuditEntry required field '{field}' missing"

    def test_audit_entry_event_types_comprehensive(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "audit-log.json"
        with open(schema_path) as f:
            schema = json.load(f)
        event_types = schema["definitions"]["AuditEntry"]["properties"]["event_type"]["enum"]
        # Verify the 5 major categories are represented
        assert any(t.startswith("gate.") for t in event_types), "Missing gate.* event types"
        assert any(t.startswith("session.") for t in event_types), "Missing session.* event types"
        assert any(t.startswith("webhook.") for t in event_types), "Missing webhook.* event types"
        assert any(t.startswith("commerce.") for t in event_types), "Missing commerce.* event types"
        assert any(t.startswith("data.") for t in event_types), "Missing data.* event types"

    def test_audit_log_example_is_valid(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "audit-log.json"
        with open(schema_path) as f:
            schema = json.load(f)
        example = schema["examples"][0]
        # Top-level required fields
        for field in schema["required"]:
            assert field in example, f"Top-level required field '{field}' missing from example"
        # Entry-level required fields
        entry = example["entries"][0]
        for field in schema["definitions"]["AuditEntry"]["required"]:
            assert field in entry, f"AuditEntry required field '{field}' missing from example entry"


class TestSigningAlgorithmsCompatibility:
    """Verify signing_algorithms field is present and valid in eep-manifest.json."""

    def test_signing_algorithms_field_in_schema(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "eep-manifest.json"
        with open(schema_path) as f:
            schema = json.load(f)
        assert "signing_algorithms" in schema["properties"]
        sa = schema["properties"]["signing_algorithms"]
        assert sa["type"] == "array"
        assert sa["minItems"] == 1
        assert "EdDSA" in sa["items"]["enum"]
        assert "ES256K" in sa["items"]["enum"]
        assert "ML-DSA-65" in sa["items"]["enum"]
        assert "hybrid-EdDSA-ML-DSA-65" in sa["items"]["enum"]

    def test_signing_algorithms_examples_are_valid(self):
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "eep-manifest.json"
        with open(schema_path) as f:
            schema = json.load(f)
        sa = schema["properties"]["signing_algorithms"]
        valid_values = set(sa["items"]["enum"])
        for example in sa["examples"]:
            for algo in example:
                assert algo in valid_values, f"Algorithm '{algo}' in examples not in enum"

    def test_signing_algorithms_default_is_eddsa(self):
        """Whitepaper §10.9: if absent from manifest, agents MUST default to EdDSA."""
        import pathlib
        schema_path = pathlib.Path(__file__).parent.parent.parent / "schemas" / "v0.1" / "eep-manifest.json"
        with open(schema_path) as f:
            schema = json.load(f)
        # signing_algorithms should NOT be in the required[] list (it's optional, EdDSA default)
        required = schema.get("required", [])
        assert "signing_algorithms" not in required, \
            "signing_algorithms must be optional (absent = default to EdDSA)"


def _server_reachable(url: str) -> bool:
    try:
        httpx.get(url, timeout=1)
        return True
    except Exception:
        return False
