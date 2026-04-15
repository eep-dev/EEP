from __future__ import annotations

import base64
import json
from typing import Any


class JWTAuthAdapter:
    def __init__(self, did_claim: str = "sub", capability_claim: str = "scope") -> None:
        self._did_claim = did_claim
        self._capability_claim = capability_claim

    async def extract_proofs(self, headers: dict[str, str], query: dict[str, str] | None = None) -> list[dict[str, Any]]:
        auth_header = headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return []

        token = auth_header.removeprefix("Bearer ").strip()
        parts = token.split(".")
        if len(parts) < 2:
            return []

        try:
            payload_segment = parts[1]
            padding = "=" * ((4 - len(payload_segment) % 4) % 4)
            payload_raw = base64.urlsafe_b64decode(payload_segment + padding).decode("utf-8")
            payload = json.loads(payload_raw)
        except Exception:
            return []

        proofs: list[dict[str, Any]] = []
        did_value = payload.get(self._did_claim)
        if isinstance(did_value, str) and did_value:
            proofs.append({"type": "identity", "method": "did_verified", "evidence": did_value})

        scopes = payload.get(self._capability_claim)
        if isinstance(scopes, str) and scopes.strip():
            proofs.append({"type": "capability", "declared_capabilities": [item for item in scopes.split(" ") if item]})

        return proofs
