# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_discovery — Python port of @eep-dev/discovery."""

import pytest
from eep_discovery import (
    validate_manifest,
    parse_link_header,
    parse_dns_txt_record,
)


# ═══════════════════════════════════════════════════════════════════
# Manifest Validation Tests
# ═══════════════════════════════════════════════════════════════════

VALID_MANIFEST = {
    "did": "did:web:example.com",
    "eep_version": "0.1",
    "layers": {"layer1": "https://api.example.com/eep"},
    "supported_content_types": ["application/json"],
    "pqc_ready": False,
    "x402_enabled": True,
}


class TestValidateManifest:
    def test_valid_minimal(self):
        r = validate_manifest(VALID_MANIFEST)
        assert r.valid is True
        assert r.errors == []

    def test_valid_with_optional_fields(self):
        full = {
            **VALID_MANIFEST,
            "eep_versions": ["0.1", "1.0"],
            "signing_algorithms": ["EdDSA", "ES256K"],
            "tls_mode": "mTLS",
            "pricing_mode": "negotiable",
        }
        assert validate_manifest(full).valid is True

    def test_reject_none(self):
        r = validate_manifest(None)
        assert r.valid is False

    def test_reject_string(self):
        r = validate_manifest("string")
        assert r.valid is False

    def test_require_did(self):
        m = {k: v for k, v in VALID_MANIFEST.items() if k != "did"}
        r = validate_manifest(m)
        assert r.valid is False
        assert any("did" in e for e in r.errors)

    def test_invalid_did_format(self):
        r = validate_manifest({**VALID_MANIFEST, "did": "not-a-did"})
        assert r.valid is False

    def test_require_eep_version(self):
        m = {k: v for k, v in VALID_MANIFEST.items() if k != "eep_version"}
        r = validate_manifest(m)
        assert r.valid is False

    def test_invalid_version_format(self):
        r = validate_manifest({**VALID_MANIFEST, "eep_version": "latest"})
        assert r.valid is False

    def test_require_layers_layer1(self):
        r = validate_manifest({**VALID_MANIFEST, "layers": {}})
        assert r.valid is False

    def test_require_layers_object(self):
        m = {k: v for k, v in VALID_MANIFEST.items() if k != "layers"}
        assert validate_manifest(m).valid is False

    def test_require_content_types(self):
        r = validate_manifest({**VALID_MANIFEST, "supported_content_types": []})
        assert r.valid is False

    def test_require_pqc_boolean(self):
        r = validate_manifest({**VALID_MANIFEST, "pqc_ready": "yes"})
        assert r.valid is False

    def test_require_x402_boolean(self):
        r = validate_manifest({**VALID_MANIFEST, "x402_enabled": 1})
        assert r.valid is False

    def test_invalid_signing_algorithm(self):
        r = validate_manifest({**VALID_MANIFEST, "signing_algorithms": ["INVALID"]})
        assert r.valid is False

    def test_invalid_tls_mode(self):
        r = validate_manifest({**VALID_MANIFEST, "tls_mode": "none"})
        assert r.valid is False

    def test_invalid_pricing_mode(self):
        r = validate_manifest({**VALID_MANIFEST, "pricing_mode": "free"})
        assert r.valid is False

    def test_multiple_errors(self):
        r = validate_manifest({})
        assert r.valid is False
        assert len(r.errors) >= 5


# ═══════════════════════════════════════════════════════════════════
# Link Header Parsing Tests
# ═══════════════════════════════════════════════════════════════════

class TestParseLinkHeader:
    def test_eep_link(self):
        r = parse_link_header('<https://api.example.com/.well-known/eep.json>; rel="eep"')
        assert len(r) == 1
        assert r[0].url == "https://api.example.com/.well-known/eep.json"
        assert r[0].rel == "eep"

    def test_subscribe_link(self):
        r = parse_link_header('<https://api.example.com/eep/subscribe>; rel="subscribe"')
        assert len(r) == 1
        assert r[0].rel == "subscribe"

    def test_multiple_links(self):
        h = '<https://a.com/eep.json>; rel="eep", <https://a.com/sub>; rel="subscribe"'
        assert len(parse_link_header(h)) == 2

    def test_ignore_non_eep(self):
        r = parse_link_header('<https://example.com>; rel="canonical"')
        assert len(r) == 0

    def test_extract_type(self):
        r = parse_link_header('<https://a.com/eep.json>; rel="eep"; type="application/json"')
        assert r[0].type == "application/json"

    def test_none_returns_empty(self):
        assert parse_link_header(None) == []
        assert parse_link_header("") == []


# ═══════════════════════════════════════════════════════════════════
# DNS TXT Record Parsing Tests
# ═══════════════════════════════════════════════════════════════════

class TestParseDnsTxtRecord:
    def test_valid_record(self):
        r = parse_dns_txt_record("v=eep1; manifest=https://api.example.com/.well-known/eep.json")
        assert r.valid is True
        assert r.version == "eep1"
        assert r.manifest_url == "https://api.example.com/.well-known/eep.json"

    def test_missing_version(self):
        r = parse_dns_txt_record("manifest=https://example.com/eep.json")
        assert r.valid is False

    def test_invalid_version(self):
        r = parse_dns_txt_record("v=spf1; manifest=https://example.com/eep.json")
        assert r.valid is False

    def test_missing_manifest(self):
        r = parse_dns_txt_record("v=eep1")
        assert r.valid is False

    def test_non_https(self):
        r = parse_dns_txt_record("v=eep1; manifest=http://example.com/eep.json")
        assert r.valid is False

    def test_none_returns_invalid(self):
        assert parse_dns_txt_record(None).valid is False
        assert parse_dns_txt_record("").valid is False
