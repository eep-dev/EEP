# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_compliance_cli.helpers — Testable helper utilities for the compliance runner.

Python port of @eep-dev/compliance-cli/src/helpers.ts.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class TestResult:
    """A single test result."""
    name: str
    status: str  # "pass" | "fail" | "skip"
    detail: Optional[str] = None


class TestRunner:
    """Collects test results and produces a summary."""

    def __init__(self) -> None:
        self.results: List[TestResult] = []

    def pass_(self, name: str, detail: Optional[str] = None) -> None:
        self.results.append(TestResult(name=name, status="pass", detail=detail))

    def fail(self, name: str, detail: str) -> None:
        self.results.append(TestResult(name=name, status="fail", detail=detail))

    def skip(self, name: str, reason: str) -> None:
        self.results.append(TestResult(name=name, status="skip", detail=reason))

    def summary(self) -> Dict[str, int]:
        passed = sum(1 for r in self.results if r.status == "pass")
        failed = sum(1 for r in self.results if r.status == "fail")
        skipped = sum(1 for r in self.results if r.status == "skip")
        return {"passed": passed, "failed": failed, "skipped": skipped, "total": len(self.results)}

    def conformance_label(self, level: str) -> str:
        s = self.summary()
        if s["failed"] > 0:
            count = s["failed"]
            return f"❌ Not EEP Compliant ({count} failure{'s' if count != 1 else ''})"
        # A conformance claim must be *earned*, not granted by omission. A run
        # with zero passing checks, or with skipped checks, has not actually
        # verified the level — so it must not receive a compliance medal even
        # though ``failed == 0``. (Otherwise a near-empty or fully-skipped run
        # would print "Full EEP Compliant".)
        if s["passed"] == 0:
            return "❌ Not EEP Compliant (no checks verified)"
        if s["skipped"] > 0:
            return (
                f"⚠️ {level.title()} EEP: incomplete "
                f"({s['skipped']} skipped, {s['passed']} passed)"
            )
        labels = {
            "core": "🥉 Core EEP Compliant",
            "standard": "🥈 Standard EEP Compliant",
            "full": "🏆 Full EEP Compliant",
        }
        return labels.get(level, f"✅ {level.title()} EEP Compliant")


def normalize_target(url: str) -> str:
    """Strip trailing slashes from a URL."""
    return url.rstrip("/")


def validate_args(
    target: Optional[str] = None,
    level: Optional[str] = None,
    port: Optional[str] = None,
) -> Optional[str]:
    """Validate CLI arguments. Returns error string or None."""
    if not target:
        return "Missing required argument: --target"
    if level and level not in ("core", "standard", "full"):
        return f"Invalid conformance level: '{level}'. Must be one of: core, standard, full"
    if port:
        try:
            p = int(port)
            if p < 1 or p > 65535:
                raise ValueError
        except ValueError:
            return f"Invalid port: '{port}'. Must be a number between 1 and 65535"
    return None


def validate_cloudevents_envelope(event: Dict[str, Any]) -> List[str]:
    """Validate required CloudEvents fields. Returns list of missing fields."""
    missing: List[str] = []
    for f in ("specversion", "id", "source", "type", "time"):
        if not event.get(f):
            missing.append(f)
    if event.get("specversion") != "1.0":
        missing.append('specversion (must be "1.0")')
    return missing


def validate_eep_extensions(event: Dict[str, Any]) -> List[str]:
    """Validate EEP extension attributes. Returns list of missing attributes."""
    missing: List[str] = []
    if not event.get("eep_version"):
        missing.append("eep_version")
    return missing


def verify_webhook_signature(
    webhook_id: str,
    timestamp: str,
    raw_body: str,
    secret: str,
    signature_header: str,
) -> Dict[str, Any]:
    """Verify a Standard Webhooks v1 HMAC-SHA256 signature.

    Python port of ``verifyWebhookSignature`` in
    ``@eep-dev/compliance-cli/src/helpers.ts`` (EEP SPECIFICATION.md §5.3).

    The signed content is ``f"{webhook_id}.{timestamp}.{raw_body}"`` where
    ``raw_body`` MUST be the exact bytes the sender hashed — never a
    re-serialized parse of the JSON. Re-serializing (``json.dumps`` of a parsed
    body) changes key order, whitespace, and unicode escaping, so every
    signature would falsely fail.

    The header MAY carry space-separated tokens (secret rotation), e.g.
    ``v1,sigA v1,sigB``; non-``v1`` schemes are ignored. Comparison is
    timing-safe on the raw digest bytes.

    Returns ``{"valid": bool, "reason": str}`` where ``reason`` is one of:
    ``ok``, ``ok_via_multi_signature``, ``missing_secret``,
    ``malformed_header``, ``no_v1_token``, ``signature_mismatch``.
    """
    if not secret:
        return {"valid": False, "reason": "missing_secret"}
    if not isinstance(signature_header, str) or signature_header == "":
        return {"valid": False, "reason": "malformed_header"}

    signed_content = f"{webhook_id}.{timestamp}.{raw_body}"
    expected = hmac.new(secret.encode("utf-8"), signed_content.encode("utf-8"), hashlib.sha256).digest()

    tokens = [t for t in signature_header.split(" ") if t]
    v1_tokens = [t for t in tokens if t.startswith("v1,")]
    if not v1_tokens:
        return {"valid": False, "reason": "no_v1_token"}

    for token in v1_tokens:
        try:
            incoming = base64.b64decode(token[len("v1,"):], validate=True)
        except (binascii.Error, ValueError):
            continue
        if len(incoming) != len(expected):
            continue
        if hmac.compare_digest(incoming, expected):
            return {
                "valid": True,
                "reason": "ok_via_multi_signature" if len(v1_tokens) > 1 else "ok",
            }

    return {"valid": False, "reason": "signature_mismatch"}


def check_webhook_headers(headers: Dict[str, Optional[str]]) -> Dict[str, Any]:
    """Check if Standard Webhooks headers are present."""
    has_id = bool(headers.get("webhook-id"))
    has_ts = bool(headers.get("webhook-timestamp"))
    has_sig = bool(headers.get("webhook-signature"))
    missing: List[str] = []
    if not has_id:
        missing.append("webhook-id")
    if not has_ts:
        missing.append("webhook-timestamp")
    if not has_sig:
        missing.append("webhook-signature")
    return {"hasId": has_id, "hasTimestamp": has_ts, "hasSignature": has_sig, "missing": missing}
