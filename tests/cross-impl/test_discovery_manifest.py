# Copyright 2026 EEP Contributors — Apache-2.0
"""
Cross-implementation test: EEP discovery manifest validation.

Tests that both TS and Python implementations correctly validate
the /.well-known/eep.json manifest against the schema.
"""

import json
import os
import pytest

SCHEMA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "schemas", "v0.1", "eep-manifest.json"
)


class TestManifestDiscovery:
    """Cross-impl discovery manifest tests."""

    def test_schema_file_exists(self):
        """The eep-manifest.json schema must exist."""
        assert os.path.isfile(SCHEMA_PATH), f"Schema not found at {SCHEMA_PATH}"

    def test_schema_is_valid_json(self):
        """Schema must be valid JSON."""
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert "did" in schema.get("required", [])

    def test_schema_required_fields(self):
        """Schema must require the 4 mandatory fields per §4.1.

        ``pqc_ready`` and ``x402_enabled`` were required until the manifest was
        de-vendored: they are capabilities a publisher *advertises*, not bars it
        must clear, so requiring a payment-rail flag in every manifest tied
        conformance to one ecosystem. They are now optional with a documented
        default of ``false``.
        """
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        required = set(schema["required"])
        expected = {"did", "eep_version", "layers", "supported_content_types"}
        assert expected.issubset(required), f"Missing required: {expected - required}"
        # Still defined, still constrained — just no longer mandatory.
        for optional in ("pqc_ready", "x402_enabled"):
            assert optional not in required, f"{optional} should be optional"
            assert optional in schema["properties"], f"{optional} should still be defined"
            assert schema["properties"][optional].get("default") is False

    def test_schema_layers_requires_layer1(self):
        """layers object must require layer1."""
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        layers_schema = schema["properties"]["layers"]
        assert "layer1" in layers_schema.get("required", [])

    def test_schema_signing_algorithms_enum(self):
        """signing_algorithms must include EdDSA and PQC algorithms."""
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        alg_enum = schema["properties"]["signing_algorithms"]["items"]["enum"]
        assert "EdDSA" in alg_enum
        assert "ML-DSA-65" in alg_enum
        assert "hybrid-EdDSA-ML-DSA-65" in alg_enum

    def test_schema_conformance_tiers(self):
        """Conformance credential must use Core/Standard/Full tiers."""
        with open(SCHEMA_PATH) as f:
            schema = json.load(f)
        tiers = schema["properties"]["conformance_credential"]["properties"]["credentialSubject"]["properties"]["conformanceTier"]["enum"]
        assert tiers == ["Core", "Standard", "Full"]

    def test_manifest_example_validates(self):
        """A minimal valid manifest must pass Python validation."""
        try:
            from eep_discovery import validate_manifest
            result = validate_manifest({
                "did": "did:web:example.com",
                "eep_version": "0.1",
                "layers": {"layer1": "https://api.example.com/eep"},
                "supported_content_types": ["application/json"],
                "pqc_ready": False,
                "x402_enabled": True,
            })
            assert result.valid is True
        except ImportError:
            pytest.skip("eep_discovery not installed")
