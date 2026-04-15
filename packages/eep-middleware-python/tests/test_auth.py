import base64
import json

import pytest

from eep_middleware.auth.api_key import APIKeyAuthAdapter
from eep_middleware.auth.jwt import JWTAuthAdapter


def encode_token(payload: dict) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{header}.{body}.sig"


@pytest.mark.asyncio
async def test_jwt_auth_adapter_extracts_proofs_and_handles_invalid_tokens() -> None:
    adapter = JWTAuthAdapter()
    token = encode_token({"sub": "did:web:alice.example", "scope": "profile.read profile.write"})
    proofs = await adapter.extract_proofs({"authorization": f"Bearer {token}"})
    assert len(proofs) == 2

    assert await adapter.extract_proofs({}) == []
    assert await adapter.extract_proofs({"authorization": "Bearer bad"}) == []
    assert await adapter.extract_proofs({"authorization": "Bearer a.b@d.c"}) == []
    assert await adapter.extract_proofs({"authorization": "Bearer h.eyJhIjoiYiJ9.s"}) == []


@pytest.mark.asyncio
async def test_api_key_auth_adapter_extracts_and_filters_proofs() -> None:
    async def resolver(api_key: str):
        if api_key == "valid":
            return {"did": "did:web:agent.example", "capabilities": ["trade.read"]}
        if api_key == "did-only":
            return {"did": "did:web:agent.example"}
        if api_key == "cap-only":
            return {"capabilities": ["trade.read"]}
        if api_key == "partial":
            return {}
        return None

    adapter = APIKeyAuthAdapter(resolver)
    assert len(await adapter.extract_proofs({"x-api-key": "valid"})) == 2
    assert len(await adapter.extract_proofs({"x-api-key": "did-only"})) == 1
    assert len(await adapter.extract_proofs({"x-api-key": "cap-only"})) == 1
    assert await adapter.extract_proofs({"x-api-key": "partial"}) == []
    assert await adapter.extract_proofs({"x-api-key": "unknown"}) == []
    assert await adapter.extract_proofs({}) == []
