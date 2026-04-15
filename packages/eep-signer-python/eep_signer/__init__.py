# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_signer — Standard Webhooks HMAC-SHA256 signing and verification for EEP.

Python port of @eep-dev/signer (TypeScript).

Implements the signature algorithm defined in EEP SPECIFICATION.md §5.3:
  signed_content = "{webhook-id}.{webhook-timestamp}.{raw-body}"
  signature = "v1," + base64(hmac-sha256(secret, signed_content))
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import math
import time
from typing import Dict, Optional, Union


class EEPSignatureError(Exception):
    """Raised when a webhook signature is structurally invalid."""

    def __init__(self, message: str) -> None:
        super().__init__(f"EEPSignatureError: {message}")


class EEPSigner:
    """Standard Webhooks HMAC-SHA256 signing and verification for EEP."""

    def __init__(self, secret: str) -> None:
        """
        Args:
            secret: The delivery_secret for this subscription.
                    Must be at least 16 characters. Store securely.
        """
        if not secret or len(secret) < 16:
            raise ValueError("EEPSigner: secret must be at least 16 characters long")
        self._secret = secret

    def sign(self, webhook_id: str, timestamp: str, raw_body: str) -> str:
        """Sign a webhook payload.

        Args:
            webhook_id: Unique message ID (e.g. ``msg_01HN3QK7GX``).
            timestamp: Unix timestamp in seconds as string.
            raw_body: Raw JSON string — must NOT be re-serialised.

        Returns:
            Value for the ``webhook-signature`` header (``v1,<base64>``).
        """
        signed_content = f"{webhook_id}.{timestamp}.{raw_body}"
        mac = hmac.new(
            self._secret.encode("utf-8"),
            signed_content.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return f"v1,{base64.b64encode(mac).decode('ascii')}"

    def verify(
        self,
        webhook_id: str,
        timestamp: str,
        signature: str,
        raw_body: str,
        tolerance_seconds: int = 60,
    ) -> bool:
        """Verify a webhook payload's signature.

        Performs timing-safe comparison and validates timestamp freshness.

        Args:
            webhook_id: From the ``webhook-id`` header.
            timestamp: From the ``webhook-timestamp`` header.
            signature: From the ``webhook-signature`` header.
            raw_body: Raw request body as string.
            tolerance_seconds: Max age in seconds. Default 60 (per EEP whitepaper §Security — normative).

        Returns:
            ``True`` if the signature is valid and timestamp is fresh.

        Raises:
            EEPSignatureError: If timestamp is invalid or outside tolerance.
        """
        # 1. Validate timestamp freshness
        try:
            ts_num = int(timestamp)
        except (ValueError, TypeError):
            raise EEPSignatureError("Invalid webhook-timestamp: not a number")

        age = int(time.time()) - ts_num
        if abs(age) > tolerance_seconds:
            raise EEPSignatureError(
                f"webhook-timestamp is outside the {tolerance_seconds}s tolerance window (age: {age}s)"
            )

        # 2. Compute expected signature
        signed_content = f"{webhook_id}.{timestamp}.{raw_body}"
        expected_mac = hmac.new(
            self._secret.encode("utf-8"),
            signed_content.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        expected = f"v1,{base64.b64encode(expected_mac).decode('ascii')}"

        # 3. Compare incoming signatures (timing-safe)
        # Header may contain multiple: "v1,sig1 v1,sig2"
        for sig in signature.split(" "):
            if len(sig) == len(expected) and hmac.compare_digest(
                sig.encode("utf-8"), expected.encode("utf-8")
            ):
                return True

        return False


def verify_eep_webhook(
    raw_body: str,
    headers: Dict[str, Optional[str]],
    secret: str,
) -> bool:
    """Convenience: verify a webhook in a FastAPI / Flask handler.

    Args:
        raw_body: Raw request body as string.
        headers: Request headers dict.
        secret: The delivery_secret.

    Returns:
        ``True`` if valid, ``False`` otherwise.
    """
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature = headers.get("webhook-signature")

    if not webhook_id or not timestamp or not signature:
        return False

    try:
        signer = EEPSigner(secret)
        return signer.verify(webhook_id, timestamp, signature, raw_body)
    except Exception:
        return False


__all__ = ["EEPSigner", "EEPSignatureError", "verify_eep_webhook"]
