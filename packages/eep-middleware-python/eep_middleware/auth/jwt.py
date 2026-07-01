from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import inspect
import json
import time
import warnings
from typing import Any, Awaitable, Callable, Optional, Union

# HS* algorithms this adapter can verify natively, mapped to their hashlib constructor.
_HMAC_ALGORITHMS: dict[str, Callable[[], "hashlib._Hash"]] = {
    "HS256": hashlib.sha256,
    "HS384": hashlib.sha384,
    "HS512": hashlib.sha512,
}

# Verified-claims callback for asymmetric (RSA / ECDSA / EdDSA) or otherwise custom tokens.
# It receives the raw compact JWT and MUST return the verified claim set (a dict) or ``None``
# if the signature does not verify. Sync and async callables are both supported.
VerifyTokenFn = Callable[
    [str], Union[Optional[dict[str, Any]], Awaitable[Optional[dict[str, Any]]]]
]


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * ((4 - len(segment) % 4) % 4)
    return base64.urlsafe_b64decode(segment + padding)


class JWTAuthAdapter:
    """Extract EEP proofs from a bearer JWT, but only after verifying its signature.

    The adapter fails closed: ``alg: none`` is always rejected, and a token is trusted only
    when its signature verifies against a configured HS* ``secret`` or a ``verify_token``
    callback. Without verification material it emits no proofs.
    """

    def __init__(
        self,
        did_claim: str = "sub",
        capability_claim: str = "scope",
        *,
        secret: Union[str, bytes, None] = None,
        verify_token: Optional[VerifyTokenFn] = None,
        algorithms: Optional[list[str]] = None,
        clock_tolerance_sec: int = 60,
    ) -> None:
        self._did_claim = did_claim
        self._capability_claim = capability_claim
        if secret is None:
            self._secret: Optional[bytes] = None
        elif isinstance(secret, bytes):
            self._secret = secret
        else:
            self._secret = secret.encode("utf-8")
        self._verify_token = verify_token
        self._algorithms = algorithms
        self._clock_tolerance_sec = clock_tolerance_sec

        if self._secret is None and self._verify_token is None:
            warnings.warn(
                "JWTAuthAdapter constructed without `secret` or `verify_token`; it will reject all "
                "tokens. Configure an HS* secret or a verify_token callback to enable authentication.",
                UserWarning,
                stacklevel=2,
            )

    async def extract_proofs(
        self, headers: dict[str, str], query: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        auth_header = headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return []

        token = auth_header.removeprefix("Bearer ").strip()
        parts = token.split(".")
        if len(parts) < 2:
            return []

        try:
            header = json.loads(_b64url_decode(parts[0]).decode("utf-8"))
            payload = json.loads(_b64url_decode(parts[1]).decode("utf-8"))
        except (ValueError, binascii.Error, UnicodeDecodeError):
            return []

        if not isinstance(header, dict) or not isinstance(payload, dict):
            return []

        alg = header.get("alg")
        alg = alg if isinstance(alg, str) else ""
        # `alg: none` (in any casing) is never acceptable for a token we are asked to trust.
        if not alg or alg.lower() == "none":
            return []
        if self._algorithms is not None and alg not in self._algorithms:
            return []

        claims = await self._verify_claims(alg, parts, token, payload)
        if claims is None:
            return []
        if not self._passes_temporal_checks(claims):
            return []

        return self._claims_to_proofs(claims)

    async def _verify_claims(
        self, alg: str, parts: list[str], token: str, payload: dict[str, Any]
    ) -> Optional[dict[str, Any]]:
        if alg in _HMAC_ALGORITHMS:
            if self._secret is None or len(parts) != 3:
                return None
            signing_input = f"{parts[0]}.{parts[1]}".encode("utf-8")
            expected = hmac.new(self._secret, signing_input, _HMAC_ALGORITHMS[alg]).digest()
            try:
                provided = _b64url_decode(parts[2])
            except (binascii.Error, ValueError):
                return None
            return payload if hmac.compare_digest(expected, provided) else None

        # Asymmetric / custom algorithm: delegate to the configured verifier (fail closed if none).
        if self._verify_token is None:
            return None
        try:
            result = self._verify_token(token)
            if inspect.isawaitable(result):
                result = await result
        except Exception:
            return None
        if not isinstance(result, dict):
            return None
        return result

    def _passes_temporal_checks(self, claims: dict[str, Any]) -> bool:
        now = int(time.time())
        tolerance = self._clock_tolerance_sec

        exp = claims.get("exp")
        if isinstance(exp, (int, float)) and now > exp + tolerance:
            return False
        nbf = claims.get("nbf")
        if isinstance(nbf, (int, float)) and now < nbf - tolerance:
            return False
        iat = claims.get("iat")
        if isinstance(iat, (int, float)) and iat > now + tolerance:
            return False
        return True

    def _claims_to_proofs(self, claims: dict[str, Any]) -> list[dict[str, Any]]:
        proofs: list[dict[str, Any]] = []

        did_value = claims.get(self._did_claim)
        if isinstance(did_value, str) and did_value:
            proofs.append({"type": "identity", "method": "did_verified", "evidence": did_value})

        scopes = claims.get(self._capability_claim)
        if isinstance(scopes, str) and scopes.strip():
            proofs.append(
                {"type": "capability", "declared_capabilities": [item for item in scopes.split(" ") if item]}
            )

        return proofs
