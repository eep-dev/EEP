# Copyright 2026 EEP Contributors — Apache-2.0
"""Tests for eep_signer — Python port of @eep-dev/signer."""

import time
import pytest
from eep_signer import EEPSigner, EEPSignatureError, verify_eep_webhook


SECRET = "this-is-a-test-secret-at-least-16"
WEBHOOK_ID = "msg_01HN3QK7GX"
BODY = '{"type":"com.example.entity.updated","data":{}}'


class TestEEPSigner:
    def test_constructor_rejects_short_secret(self):
        with pytest.raises(ValueError):
            EEPSigner("too_short")

    def test_sign_returns_v1_prefix(self):
        signer = EEPSigner(SECRET)
        sig = signer.sign(WEBHOOK_ID, "1700000000", BODY)
        assert sig.startswith("v1,")

    def test_sign_is_deterministic(self):
        signer = EEPSigner(SECRET)
        sig1 = signer.sign(WEBHOOK_ID, "1700000000", BODY)
        sig2 = signer.sign(WEBHOOK_ID, "1700000000", BODY)
        assert sig1 == sig2

    def test_sign_differs_with_different_body(self):
        signer = EEPSigner(SECRET)
        sig1 = signer.sign(WEBHOOK_ID, "1700000000", BODY)
        sig2 = signer.sign(WEBHOOK_ID, "1700000000", '{"other":"body"}')
        assert sig1 != sig2

    def test_verify_valid_signature(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        sig = signer.sign(WEBHOOK_ID, ts, BODY)
        assert signer.verify(WEBHOOK_ID, ts, sig, BODY) is True

    def test_verify_rejects_wrong_signature(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        assert signer.verify(WEBHOOK_ID, ts, "v1,AAAA", BODY) is False

    def test_verify_rejects_expired_timestamp(self):
        signer = EEPSigner(SECRET)
        old_ts = str(int(time.time()) - 600)
        sig = signer.sign(WEBHOOK_ID, old_ts, BODY)
        with pytest.raises(EEPSignatureError, match="tolerance"):
            signer.verify(WEBHOOK_ID, old_ts, sig, BODY)

    def test_verify_rejects_invalid_timestamp(self):
        signer = EEPSigner(SECRET)
        with pytest.raises(EEPSignatureError, match="not a number"):
            signer.verify(WEBHOOK_ID, "not-a-number", "v1,x", BODY)

    def test_verify_with_multiple_signatures(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        valid = signer.sign(WEBHOOK_ID, ts, BODY)
        combined = f"v1,INVALID {valid}"
        assert signer.verify(WEBHOOK_ID, ts, combined, BODY) is True


class TestVerifyEEPWebhook:
    def test_valid_webhook(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        sig = signer.sign(WEBHOOK_ID, ts, BODY)
        headers = {
            "webhook-id": WEBHOOK_ID,
            "webhook-timestamp": ts,
            "webhook-signature": sig,
        }
        assert verify_eep_webhook(BODY, headers, SECRET) is True

    def test_missing_headers(self):
        assert verify_eep_webhook(BODY, {}, SECRET) is False

    def test_wrong_secret(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        sig = signer.sign(WEBHOOK_ID, ts, BODY)
        headers = {
            "webhook-id": WEBHOOK_ID,
            "webhook-timestamp": ts,
            "webhook-signature": sig,
        }
        assert verify_eep_webhook(BODY, headers, "different-secret-16chars") is False

    def test_invalid_secret_length_returns_false(self):
        # A short secret will raise ValueError in EEPSigner, caught and returning False
        ts = str(int(time.time()))
        headers = {
            "webhook-id": WEBHOOK_ID,
            "webhook-timestamp": ts,
            "webhook-signature": "v1,fake",
        }
        assert verify_eep_webhook(BODY, headers, "short") is False


class TestTruncatedSignature:
    """SPECIFICATION.md §5.3 requirement 2: a length-mismatched signature
    MUST produce a verification failure, never an exception.

    A truncated prefix of the *correct* signature is the attacker-controlled
    input that makes an unguarded constant-time comparison raise instead of
    returning False — turning an authentication failure (401) into a server
    error (500). Mirrors the conformance fixture
    ``tests/conformance-fixtures/signature/truncated-signature``.
    """

    def test_truncated_signature_returns_false(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        real = signer.sign(WEBHOOK_ID, ts, BODY)
        for cut in (4, 10, 20, len(real) - 1):
            assert signer.verify(WEBHOOK_ID, ts, real[:cut], BODY) is False

    def test_overlong_signature_returns_false(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        padded = signer.sign(WEBHOOK_ID, ts, BODY) + "AAAA"
        assert signer.verify(WEBHOOK_ID, ts, padded, BODY) is False

    def test_truncated_signature_via_convenience_helper(self):
        signer = EEPSigner(SECRET)
        ts = str(int(time.time()))
        real = signer.sign(WEBHOOK_ID, ts, BODY)
        headers = {
            "webhook-id": WEBHOOK_ID,
            "webhook-timestamp": ts,
            "webhook-signature": real[:20],
        }
        assert verify_eep_webhook(BODY, headers, SECRET) is False
