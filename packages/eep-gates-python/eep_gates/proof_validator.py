# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_gates.proof_validator — Structural proof validation + semantic verifier interface.

Two-step proof validation:
  1. Structural (protocol-level): Does the proof have the right fields? Is it fresh?
  2. Semantic (platform-level): Is the payment token actually valid?
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional

from .models import ValidationResult

_ONE_MINUTE_MS = 60_000
_HEX_SIG_RE = re.compile(r"^0x[0-9a-fA-F]{128,}$")
_SHA256_HASH_RE = re.compile(r"^sha256:[a-f0-9]{64}$")


def validate_proof_structure(proof: Any) -> ValidationResult:
    """Validate the structural integrity of a gate proof.

    Does NOT verify semantic validity.
    """
    errors: List[str] = []

    if not isinstance(proof, dict):
        return ValidationResult(valid=False, errors=["Proof must be an object"])

    proof_type = proof.get("type")
    if not isinstance(proof_type, str) or len(proof_type) == 0:
        return ValidationResult(valid=False, errors=['Proof must have a "type" field'])

    # Check freshness
    if "expires_at" in proof:
        ea = proof["expires_at"]
        if not isinstance(ea, str):
            errors.append("expires_at must be an ISO 8601 string")
        else:
            try:
                expiry = datetime.fromisoformat(ea.replace("Z", "+00:00"))
                if expiry < datetime.now(timezone.utc):
                    errors.append("Proof has expired")
            except ValueError:
                errors.append("expires_at is not a valid date")

    if "issued_at" in proof:
        ia = proof["issued_at"]
        if not isinstance(ia, str):
            errors.append("issued_at must be an ISO 8601 string")
        else:
            try:
                issued = datetime.fromisoformat(ia.replace("Z", "+00:00"))
                now_ms = datetime.now(timezone.utc).timestamp() * 1000
                issued_ms = issued.timestamp() * 1000
                if issued_ms > now_ms + _ONE_MINUTE_MS:
                    errors.append("Proof issued_at is in the future")
            except ValueError:
                errors.append("issued_at is not a valid date")

    # Type-specific structural checks
    if proof_type == "payment":
        token = proof.get("token")
        x402_payload = proof.get("x402_payload")
        has_token = isinstance(token, str) and len(token) > 0
        has_x402 = x402_payload is not None
        if not has_token and not has_x402:
            errors.append('Payment proof must have a non-empty "token" or an "x402_payload"')
        if has_x402:
            if not isinstance(x402_payload, dict):
                errors.append("x402_payload must be an object")
            else:
                payload = x402_payload.get("payload")
                signature = x402_payload.get("signature")
                network = x402_payload.get("network")
                if not isinstance(payload, str) or len(payload) == 0:
                    errors.append("x402_payload.payload must be a non-empty EIP-712 string")
                if not isinstance(signature, str) or not _HEX_SIG_RE.match(signature):
                    errors.append("x402_payload.signature must be a valid hex secp256k1 signature")
                if not isinstance(network, str) or len(network) == 0:
                    errors.append("x402_payload.network is required")
    elif proof_type == "trust":
        if proof.get("self_attested") is not True:
            errors.append("Trust proof must have self_attested=true")
    elif proof_type == "identity":
        if not isinstance(proof.get("method"), str):
            errors.append('Identity proof must have a "method"')
    elif proof_type == "connection":
        if not isinstance(proof.get("subscriber_did"), str):
            errors.append('Connection proof must have a "subscriber_did"')
    elif proof_type == "credential":
        cred = proof.get("credential")
        if not isinstance(cred, str) or len(cred) == 0:
            errors.append('Credential proof must have a "credential"')
        if not isinstance(proof.get("format"), str):
            errors.append('Credential proof must have a "format"')
    elif proof_type == "capability":
        caps = proof.get("declared_capabilities")
        if not isinstance(caps, list) or len(caps) == 0:
            errors.append('Capability proof must have non-empty "declared_capabilities"')
    elif proof_type == "allowlist":
        if not isinstance(proof.get("did"), str):
            errors.append('Allowlist proof must have a "did"')
    elif proof_type == "reciprocal":
        if not isinstance(proof.get("entity_did"), str):
            errors.append('Reciprocal proof must have an "entity_did"')
        if not isinstance(proof.get("granted_access"), str):
            errors.append('Reciprocal proof must have a "granted_access"')
    elif proof_type == "proof_of_intent":
        doc = proof.get("intent_document")
        if not isinstance(doc, dict):
            errors.append('ProofOfIntent must have an "intent_document" object')
        else:
            required_fields = [
                "intent_id",
                "agent_did",
                "principal_did",
                "action",
                "scope",
                "principal_signature",
                "created_at",
            ]
            for field in required_fields:
                if not doc.get(field):
                    errors.append(f"intent_document.{field} is required")

            scope = doc.get("scope")
            if not isinstance(scope, dict) or not scope.get("expires_at"):
                errors.append("intent_document.scope.expires_at is required")
            else:
                expires_at = scope.get("expires_at")
                if not isinstance(expires_at, str):
                    errors.append("intent_document.scope.expires_at is not valid ISO8601")
                else:
                    try:
                        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                        if expiry < datetime.now(timezone.utc):
                            errors.append("ProofOfIntent has expired")
                    except ValueError:
                        errors.append("intent_document.scope.expires_at is not valid ISO8601")
    elif proof_type == "agreement":
        doc_hash = proof.get("document_hash")
        if not isinstance(doc_hash, str) or not _SHA256_HASH_RE.match(doc_hash):
            errors.append('agreement proof must have a valid document_hash (sha256:hex)')
        signature = proof.get("signature")
        if not isinstance(signature, str) or len(signature) < 10:
            errors.append('agreement proof must have a non-empty "signature"')
        signer_did = proof.get("signer_did")
        if not isinstance(signer_did, str) or not signer_did.startswith("did:"):
            errors.append('agreement proof must have a valid "signer_did" (did:method:id)')
        signature_algo = proof.get("signature_algo")
        if signature_algo is not None and signature_algo not in ("EdDSA", "ES256K"):
            errors.append("agreement proof.signature_algo must be EdDSA or ES256K")
    elif proof_type == "data_request":
        vp = proof.get("verifiable_presentation")
        if not isinstance(vp, str) or len(vp) < 10:
            errors.append('data_request proof must have a non-empty "verifiable_presentation" (JWT VP or JSON-LD)')
        claimed_fields = proof.get("claimed_fields")
        if claimed_fields is not None and not isinstance(claimed_fields, list):
            errors.append("data_request proof.claimed_fields must be an array if present")
    else:
        if not proof_type.startswith("x-"):
            errors.append(f'Unknown proof type "{proof_type}"')

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def validate_proofs(proofs: List[Any]) -> ValidationResult:
    """Validate an array of gate proofs."""
    errors: List[str] = []

    if not isinstance(proofs, list):
        return ValidationResult(valid=False, errors=["gate_proofs must be an array"])
    if len(proofs) > 10:
        return ValidationResult(valid=False, errors=["Maximum 10 proofs allowed"])

    for i, proof in enumerate(proofs):
        result = validate_proof_structure(proof)
        if not result.valid:
            errors.extend(f"proof[{i}]: {e}" for e in result.errors)

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def delegation_permits_data_request(
    credential_subject: Dict[str, Any],
    requirement: Dict[str, Any],
) -> ValidationResult:
    """Check Delegation credentialSubject against a data_request gate requirement (SPEC §11.8)."""
    errors: List[str] = []
    pol_pub = requirement.get("policy_hash")
    pol_del = credential_subject.get("operator_privacy_policy_hash")
    if pol_pub and pol_del and pol_pub != pol_del:
        errors.append(
            "data_request policy_hash does not match delegation operator_privacy_policy_hash",
        )

    allowed = credential_subject.get("allowed_dpv_purposes")
    if isinstance(allowed, list) and len(allowed) > 0:
        for c in requirement.get("requested_claims", []) or []:
            if not isinstance(c, dict):
                continue
            purpose = c.get("purpose")
            if purpose and purpose not in allowed:
                errors.append(f"DPV purpose {purpose} is not in delegation allowed_dpv_purposes")

    max_r = credential_subject.get("max_retention_days")
    if max_r is not None and isinstance(max_r, int):
        for c in requirement.get("requested_claims", []) or []:
            if not isinstance(c, dict):
                continue
            rd = c.get("retention_days")
            if isinstance(rd, int) and rd > max_r:
                errors.append(
                    f"claim {c.get('claim', '?')} retention_days exceeds delegation max_retention_days",
                )

    return ValidationResult(valid=len(errors) == 0, errors=errors)


# ── Proof Verifier Interface (platform-level) ──────────────────────────────────


class ProofVerifier(ABC):
    """Abstract interface for semantic proof verification."""

    @property
    @abstractmethod
    def supported_types(self) -> List[str]:
        ...

    @abstractmethod
    async def verify(self, proof: Dict[str, Any], requirement: Dict[str, Any]) -> bool:
        ...


class ProofVerifierRegistry:
    """Registry of proof verifiers."""

    def __init__(self) -> None:
        self._verifiers: Dict[str, ProofVerifier] = {}

    def register(self, verifier: ProofVerifier) -> None:
        for t in verifier.supported_types:
            self._verifiers[t] = verifier

    def get_verifier(self, proof_type: str) -> Optional[ProofVerifier]:
        return self._verifiers.get(proof_type)

    def has_verifier(self, proof_type: str) -> bool:
        return proof_type in self._verifiers

    async def verify(self, proof: Dict[str, Any], requirement: Dict[str, Any]) -> bool:
        verifier = self._verifiers.get(requirement.get("type", ""))
        if verifier is None:
            return False
        return await verifier.verify(proof, requirement)
