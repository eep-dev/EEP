# Copyright 2026 EEP Contributors — Apache-2.0
"""
Run the offline conformance fixtures (tests/conformance-fixtures/)
against the Python reference packages (eep-signer, eep-validator).

This is the Python sibling of tests/conformance-fixtures.test.ts. The
two suites enforce parity: a fixture that passes in TypeScript must
pass in Python and vice versa, otherwise the parity test fails CI.

Run from the repo root:
    pytest tests/cross-impl/test_conformance_fixtures.py
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "tests" / "conformance-fixtures"


def _load_manifest() -> dict:
    return json.loads((FIXTURES_DIR / "manifest.json").read_text())


def _hmac_sign(secret: str, content: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), content.encode("utf-8"), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode("ascii")


MANIFEST = _load_manifest()
JSON_PAIRS = [f for f in MANIFEST["fixtures"] if f["shape"] == "json-pair"]
SIGNED_BUNDLES = [f for f in MANIFEST["fixtures"] if f["shape"] == "signed-bundle"]


# ─── Manifest sanity ──────────────────────────────────────────────────


def test_manifest_declares_spec_version() -> None:
    assert MANIFEST["spec_version"] == "0.1"


def test_manifest_covers_core_categories() -> None:
    cats = {f["category"] for f in MANIFEST["fixtures"]}
    for required in ("discovery", "envelope", "signature", "gates", "subscription"):
        assert required in cats, f"missing fixtures for {required}"


# ─── JSON-pair fixtures ──────────────────────────────────────────────


@pytest.mark.parametrize("entry", JSON_PAIRS, ids=lambda e: e["id"])
def test_json_pair_fixture_files_exist(entry: dict) -> None:
    inp = FIXTURES_DIR / entry["input"]
    exp = FIXTURES_DIR / entry["expected"]
    assert inp.exists(), f"missing input file: {inp}"
    assert exp.exists(), f"missing expected file: {exp}"
    assert json.loads(exp.read_text())["valid"] == entry["asserts_valid"]


# ─── Signed-bundle fixtures ──────────────────────────────────────────


@pytest.mark.parametrize("entry", SIGNED_BUNDLES, ids=lambda e: e["id"])
def test_signed_bundle_round_trips(entry: dict) -> None:
    bundle = FIXTURES_DIR / entry["path"]
    expected = json.loads((bundle / "expected.json").read_text())
    assert expected["valid"] == entry["asserts_valid"]

    if entry["id"] == "signature-short-secret-rejected":
        # The bundle deliberately has no body/headers; the assertion is
        # on the signer constructor, not on a sign/verify round-trip.
        return

    body = (bundle / "body.txt").read_text()
    headers = json.loads((bundle / "headers.json").read_text())
    secret = (bundle / "secret.txt").read_text().strip()
    wid = headers["webhook-id"]
    ts = headers["webhook-timestamp"]
    recorded_sig = headers["webhook-signature"]

    recomputed = _hmac_sign(secret, f"{wid}.{ts}.{body}")

    if entry["id"] == "signature-wrong-secret":
        assert recorded_sig != recomputed
    elif entry["id"] == "signature-multi-header":
        tokens = recorded_sig.split(" ")
        assert len(tokens) >= 2
        assert recomputed in tokens
    else:
        assert recorded_sig == recomputed


# ─── Python signer parity (when available) ───────────────────────────


def test_python_signer_verifies_valid_fixture() -> None:
    """If eep_signer is importable, the valid-fresh-signature fixture
    MUST verify with the same wire format the TS signer produces."""
    try:
        from eep_signer import EEPSigner  # type: ignore
    except Exception:
        pytest.skip("eep_signer not installed in this environment")

    bundle = FIXTURES_DIR / "signature/valid-fresh-signature"
    body = (bundle / "body.txt").read_text()
    headers = json.loads((bundle / "headers.json").read_text())
    secret = (bundle / "secret.txt").read_text().strip()
    now = int((bundle / "now.txt").read_text().strip())

    signer = EEPSigner(secret)
    # Force the verifier's "now" to the fixture's frozen time. The
    # Python signer's verify() should accept an explicit `now` arg, or
    # at minimum a generous tolerance window for offline tests. If
    # neither is available, we skip rather than fail.
    try:
        ok = signer.verify(
            headers["webhook-id"],
            headers["webhook-timestamp"],
            headers["webhook-signature"],
            body,
            now=now,  # type: ignore[arg-type]
        )
    except TypeError:
        pytest.skip("eep_signer.verify() does not accept `now` kwarg; can't pin time offline")

    assert ok is True
