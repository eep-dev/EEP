import base64
import hashlib
import hmac
import json
import time

import pytest

from eep_middleware.auth.api_key import APIKeyAuthAdapter
from eep_middleware.auth.jwt import JWTAuthAdapter

SECRET = "test-shared-secret-at-least-32-bytes-long!"

_HASHES = {"HS256": hashlib.sha256, "HS384": hashlib.sha384, "HS512": hashlib.sha512}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def sign_hs(payload: dict, secret: str = SECRET, alg: str = "HS256", header_extra: dict | None = None) -> str:
    header = {"alg": alg, "typ": "JWT"}
    if header_extra:
        header.update(header_extra)
    h = b64url(json.dumps(header).encode())
    p = b64url(json.dumps(payload).encode())
    signing_input = f"{h}.{p}".encode()
    sig = hmac.new(secret.encode(), signing_input, _HASHES[alg]).digest()
    return f"{h}.{p}.{b64url(sig)}"


def token_with_alg(payload: dict, alg: str) -> str:
    h = b64url(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    p = b64url(json.dumps(payload).encode())
    return f"{h}.{p}.ZHVtbXk"


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_unconfigured_adapter_warns_and_denies_all_tokens() -> None:
    with pytest.warns(UserWarning, match="JWTAuthAdapter"):
        adapter = JWTAuthAdapter()
    token = sign_hs({"sub": "did:web:alice.example", "scope": "profile.read profile.write"})
    assert await adapter.extract_proofs(bearer(token)) == []


@pytest.mark.asyncio
async def test_extracts_proofs_from_correctly_signed_token() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    token = sign_hs({"sub": "did:web:alice.example", "scope": "profile.read profile.write"})
    proofs = await adapter.extract_proofs(bearer(token))
    assert proofs == [
        {"type": "identity", "method": "did_verified", "evidence": "did:web:alice.example"},
        {"type": "capability", "declared_capabilities": ["profile.read", "profile.write"]},
    ]


@pytest.mark.asyncio
async def test_verifies_hs384_and_hs512() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a"}, SECRET, "HS384")))) == 1
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:b"}, SECRET, "HS512")))) == 1


@pytest.mark.asyncio
async def test_accepts_bytes_secret() -> None:
    adapter = JWTAuthAdapter(secret=SECRET.encode())
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:bytes"})))) == 1


@pytest.mark.asyncio
async def test_rejects_alg_none_even_with_secret() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    header = b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    body = b64url(json.dumps({"sub": "did:web:attacker", "scope": "admin.all"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}.")) == []


@pytest.mark.asyncio
async def test_rejects_token_with_non_string_alg() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    header = b64url(json.dumps({"typ": "JWT"}).encode())
    body = b64url(json.dumps({"sub": "did:web:a"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}.sig")) == []


@pytest.mark.asyncio
async def test_rejects_wrong_secret_and_tampered_payload() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    wrong = sign_hs({"sub": "did:web:a"}, "another-secret-another-secret-1234567")
    assert await adapter.extract_proofs(bearer(wrong)) == []

    original = sign_hs({"sub": "did:web:alice.example", "scope": "profile.read"})
    header, _, sig = original.split(".")
    forged_body = b64url(json.dumps({"sub": "did:web:attacker", "scope": "admin.all"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{forged_body}.{sig}")) == []


@pytest.mark.asyncio
async def test_rejects_wrong_length_signature() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64url(json.dumps({"sub": "did:web:a"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}.AAAA")) == []


@pytest.mark.asyncio
async def test_rejects_asymmetric_alg_without_verifier() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    token = token_with_alg({"sub": "did:web:attacker", "scope": "admin.all"}, "RS256")
    assert await adapter.extract_proofs(bearer(token)) == []


@pytest.mark.asyncio
async def test_honours_explicit_algorithms_allowlist() -> None:
    adapter = JWTAuthAdapter(secret=SECRET, algorithms=["HS256"])
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a"}, SECRET, "HS256")))) == 1
    assert await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:b"}, SECRET, "HS512"))) == []


@pytest.mark.asyncio
async def test_rejects_expired_notbefore_and_future_iat() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    now = int(time.time())
    assert await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a", "exp": now - 3600}))) == []
    assert await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a", "nbf": now + 3600}))) == []
    assert await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a", "iat": now + 3600}))) == []


@pytest.mark.asyncio
async def test_accepts_within_clock_tolerance() -> None:
    adapter = JWTAuthAdapter(secret=SECRET, clock_tolerance_sec=120)
    now = int(time.time())
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a", "exp": now - 30})))) == 1


@pytest.mark.asyncio
async def test_missing_non_bearer_and_malformed_tokens() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    assert await adapter.extract_proofs({}) == []
    assert await adapter.extract_proofs({"authorization": "Basic abc"}) == []
    assert await adapter.extract_proofs(bearer("only-one-part")) == []
    assert await adapter.extract_proofs(bearer("two.parts")) == []
    assert await adapter.extract_proofs(bearer("bad.@.sig")) == []


@pytest.mark.asyncio
async def test_emits_only_present_claims() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    assert len(await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a"})))) == 1
    assert len(await adapter.extract_proofs(bearer(sign_hs({"scope": "a b"})))) == 1
    assert await adapter.extract_proofs(bearer(sign_hs({"unrelated": True}))) == []


@pytest.mark.asyncio
async def test_supports_custom_claim_names() -> None:
    adapter = JWTAuthAdapter(secret=SECRET, did_claim="did", capability_claim="caps")
    token = sign_hs({"did": "did:web:custom", "caps": "x y"})
    assert await adapter.extract_proofs(bearer(token)) == [
        {"type": "identity", "method": "did_verified", "evidence": "did:web:custom"},
        {"type": "capability", "declared_capabilities": ["x", "y"]},
    ]


@pytest.mark.asyncio
async def test_verify_token_async_delegation() -> None:
    async def verify_token(_token: str):
        return {"sub": "did:web:rsa", "scope": "read"}

    adapter = JWTAuthAdapter(verify_token=verify_token)
    token = token_with_alg({"sub": "did:web:rsa", "scope": "read"}, "RS256")
    assert await adapter.extract_proofs(bearer(token)) == [
        {"type": "identity", "method": "did_verified", "evidence": "did:web:rsa"},
        {"type": "capability", "declared_capabilities": ["read"]},
    ]


@pytest.mark.asyncio
async def test_verify_token_sync_delegation() -> None:
    def verify_token(_token: str):
        return {"sub": "did:web:es"}

    adapter = JWTAuthAdapter(verify_token=verify_token)
    token = token_with_alg({"sub": "did:web:es"}, "ES256")
    assert len(await adapter.extract_proofs(bearer(token))) == 1


@pytest.mark.asyncio
async def test_verify_token_rejection_and_none() -> None:
    async def verify_token(_token: str):
        return None

    adapter = JWTAuthAdapter(verify_token=verify_token)
    assert await adapter.extract_proofs(bearer(token_with_alg({"sub": "x"}, "EdDSA"))) == []


@pytest.mark.asyncio
async def test_verify_token_not_consulted_for_alg_none() -> None:
    calls: list[str] = []

    async def verify_token(token: str):
        calls.append(token)
        return {"sub": "did:web:attacker"}

    adapter = JWTAuthAdapter(verify_token=verify_token)
    header = b64url(json.dumps({"alg": "none"}).encode())
    body = b64url(json.dumps({"sub": "x"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}.")) == []
    assert calls == []


@pytest.mark.asyncio
async def test_prefers_native_hmac_when_both_secret_and_verify_token() -> None:
    async def verify_token(_token: str):
        return {"sub": "did:web:should-not-be-used"}

    adapter = JWTAuthAdapter(secret=SECRET, verify_token=verify_token)
    proofs = await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:hmac"})))
    assert proofs[0]["evidence"] == "did:web:hmac"


@pytest.mark.asyncio
async def test_verify_token_results_are_temporally_checked() -> None:
    now = int(time.time())

    async def verify_token(_token: str):
        return {"sub": "did:web:rsa", "exp": now - 3600}

    adapter = JWTAuthAdapter(verify_token=verify_token)
    assert await adapter.extract_proofs(bearer(token_with_alg({"sub": "x"}, "EdDSA"))) == []


@pytest.mark.asyncio
async def test_verify_token_exception_fails_closed() -> None:
    async def verify_token(_token: str):
        raise RuntimeError("key resolution failed")

    adapter = JWTAuthAdapter(verify_token=verify_token)
    assert await adapter.extract_proofs(bearer(token_with_alg({"sub": "x"}, "ES256"))) == []


@pytest.mark.asyncio
async def test_rejects_non_dict_header_or_payload() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    array_header = b64url(json.dumps([1, 2]).encode())
    body = b64url(json.dumps({"sub": "did:web:a"}).encode())
    assert await adapter.extract_proofs(bearer(f"{array_header}.{body}.sig")) == []

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    array_body = b64url(json.dumps([1, 2, 3]).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{array_body}.sig")) == []


@pytest.mark.asyncio
async def test_hs_token_requires_secret_not_verify_token() -> None:
    async def verify_token(_token: str):
        return {"sub": "did:web:should-not-be-used"}

    adapter = JWTAuthAdapter(verify_token=verify_token)
    # An HS256 token must never be accepted via the asymmetric verify_token path.
    assert await adapter.extract_proofs(bearer(sign_hs({"sub": "did:web:a"}))) == []


@pytest.mark.asyncio
async def test_rejects_two_part_token_without_signature() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64url(json.dumps({"sub": "did:web:a"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}")) == []


@pytest.mark.asyncio
async def test_rejects_hs_token_with_invalid_base64_signature() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64url(json.dumps({"sub": "did:web:a"}).encode())
    assert await adapter.extract_proofs(bearer(f"{header}.{body}.abc@")) == []


@pytest.mark.asyncio
async def test_accepts_token_with_valid_nbf_and_iat() -> None:
    adapter = JWTAuthAdapter(secret=SECRET)
    now = int(time.time())
    token = sign_hs({"sub": "did:web:a", "nbf": now - 3600, "iat": now - 10, "exp": now + 3600})
    assert len(await adapter.extract_proofs(bearer(token))) == 1


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
