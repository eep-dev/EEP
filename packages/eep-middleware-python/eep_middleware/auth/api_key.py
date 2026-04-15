from __future__ import annotations

from typing import Any, Awaitable, Callable


APIKeyResolver = Callable[[str], Awaitable[dict[str, Any] | None]]


class APIKeyAuthAdapter:
    def __init__(self, resolver: APIKeyResolver) -> None:
        self._resolver = resolver

    async def extract_proofs(self, headers: dict[str, str], query: dict[str, str] | None = None) -> list[dict[str, Any]]:
        api_key = headers.get("x-api-key")
        if not api_key:
            return []

        resolved = await self._resolver(api_key)
        if not resolved:
            return []

        proofs: list[dict[str, Any]] = []
        did_value = resolved.get("did")
        if isinstance(did_value, str) and did_value:
            proofs.append({"type": "identity", "method": "did_verified", "evidence": did_value})

        capabilities = resolved.get("capabilities")
        if isinstance(capabilities, list) and capabilities:
            proofs.append({"type": "capability", "declared_capabilities": capabilities})

        return proofs
