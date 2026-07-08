# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_compliance_cli — Python port of @eep-dev/compliance-cli."""

from eep_compliance_cli.helpers import (
    TestRunner,
    normalize_target,
    validate_args,
    validate_cloudevents_envelope,
    validate_eep_extensions,
    check_webhook_headers,
)


class TestTestRunner:
    def test_pass_fail_skip(self):
        r = TestRunner()
        r.pass_("A")
        r.fail("B", "error")
        r.skip("C", "reason")
        s = r.summary()
        assert s == {"passed": 1, "failed": 1, "skipped": 1, "total": 3}

    def test_conformance_label_core(self):
        r = TestRunner()
        r.pass_("A")
        assert "Core" in r.conformance_label("core")

    def test_conformance_label_standard(self):
        r = TestRunner()
        r.pass_("A")
        assert "Standard" in r.conformance_label("standard")

    def test_conformance_label_failure(self):
        r = TestRunner()
        r.fail("A", "err")
        label = r.conformance_label("core")
        assert "Not EEP Compliant" in label
        assert "1 failure" in label

    def test_conformance_label_empty_run_not_compliant(self):
        r = TestRunner()
        assert r.conformance_label("full") == "❌ Not EEP Compliant (no checks verified)"

    def test_conformance_label_all_skipped_not_compliant(self):
        r = TestRunner()
        r.skip("A", "n/a")
        r.skip("B", "n/a")
        assert r.conformance_label("full") == "❌ Not EEP Compliant (no checks verified)"

    def test_conformance_label_partial_skips_incomplete(self):
        r = TestRunner()
        r.pass_("A")
        r.skip("B", "n/a")
        assert r.conformance_label("full") == "⚠️ Full EEP: incomplete (1 skipped, 1 passed)"

    def test_conformance_label_unknown_level_fallback(self):
        r = TestRunner()
        r.pass_("A")
        assert r.conformance_label("enterprise") == "✅ Enterprise EEP Compliant"


class TestNormalizeTarget:
    def test_strips_trailing_slash(self):
        assert normalize_target("https://api.example.com/") == "https://api.example.com"

    def test_strips_multiple_slashes(self):
        assert normalize_target("https://api.example.com///") == "https://api.example.com"

    def test_leaves_clean_url(self):
        assert normalize_target("https://api.example.com") == "https://api.example.com"


class TestValidateArgs:
    def test_missing_target(self):
        assert validate_args() == "Missing required argument: --target"

    def test_valid_target(self):
        assert validate_args(target="https://x.com") is None

    def test_invalid_level(self):
        result = validate_args(target="https://x.com", level="invalid")
        assert result is not None
        assert "conformance level" in result

    def test_invalid_port(self):
        result = validate_args(target="https://x.com", port="99999")
        assert result is not None
        assert "port" in result.lower()


class TestCloudEventsValidation:
    def test_valid_envelope(self):
        event = {
            "specversion": "1.0",
            "id": "evt_001",
            "source": "did:web:example.com",
            "type": "com.example.entity.updated",
            "time": "2026-01-01T00:00:00Z",
        }
        assert validate_cloudevents_envelope(event) == []

    def test_missing_fields(self):
        result = validate_cloudevents_envelope({})
        assert "specversion" in result
        assert "id" in result
        assert len(result) >= 5

    def test_wrong_specversion(self):
        event = {
            "specversion": "0.3",
            "id": "x",
            "source": "y",
            "type": "z",
            "time": "t",
        }
        result = validate_cloudevents_envelope(event)
        assert any("1.0" in m for m in result)


class TestEEPExtensions:
    def test_valid(self):
        assert validate_eep_extensions({"eep_version": "0.1"}) == []

    def test_missing(self):
        assert "eep_version" in validate_eep_extensions({})


class TestWebhookHeaders:
    def test_all_present(self):
        headers = {
            "webhook-id": "msg_001",
            "webhook-timestamp": "1700000000",
            "webhook-signature": "v1,abc",
        }
        result = check_webhook_headers(headers)
        assert result["hasId"] is True
        assert result["hasTimestamp"] is True
        assert result["hasSignature"] is True
        assert result["missing"] == []

    def test_missing_all(self):
        result = check_webhook_headers({})
        assert len(result["missing"]) == 3
