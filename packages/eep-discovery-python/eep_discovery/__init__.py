# Copyright 2026 EEP Contributors — Apache-2.0
"""
eep_discovery — EEP Discovery Utilities (Python)

Python port of @eep-dev/discovery. Implements the three discovery mechanisms
from Whitepaper §4:
  1. Well-known manifest validation (§4.1)
  2. HTTP Link header parsing (§4.4)
  3. DNS TXT record parsing (§4.4)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ─── Manifest Validation ─────────────────────────────────────────────

DID_PATTERN = re.compile(r"^did:[a-z]+:.+")
VERSION_PATTERN = re.compile(r"^\d+\.\d+")
VALID_SIGNING_ALGORITHMS = frozenset([
    "EdDSA", "ES256K", "ES256",
    "ML-DSA-65", "ML-DSA-87", "SLH-DSA-128s",
    "hybrid-EdDSA-ML-DSA-65", "hybrid-EdDSA-ML-DSA-87",
])
VALID_TLS_MODES = frozenset(["standard", "mTLS", "mTLS-required"])
VALID_PRICING_MODES = frozenset(["fixed", "negotiable", "auction"])


@dataclass
class ManifestValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    manifest: Optional[Dict[str, Any]] = None


def validate_manifest(input_data: Any) -> ManifestValidationResult:
    """Validate an EEP manifest object."""
    errors: List[str] = []

    if not isinstance(input_data, dict):
        return ManifestValidationResult(valid=False, errors=["Manifest must be a non-null object"])

    obj = input_data

    # Required: did
    did = obj.get("did")
    if not isinstance(did, str) or not did:
        errors.append("Missing required field: did")
    elif not DID_PATTERN.match(did):
        errors.append(f"Invalid DID format: '{did}' — must match did:<method>:<id>")

    # Required: eep_version
    ver = obj.get("eep_version")
    if not isinstance(ver, str) or not ver:
        errors.append("Missing required field: eep_version")
    elif not VERSION_PATTERN.match(ver):
        errors.append(f"Invalid eep_version format: '{ver}' — must be Major.Minor")

    # Required: layers
    layers = obj.get("layers")
    if not isinstance(layers, dict):
        errors.append("Missing required field: layers")
    else:
        if not isinstance(layers.get("layer1"), str) or not layers.get("layer1"):
            errors.append("Missing required field: layers.layer1")

    # Required: supported_content_types
    sct = obj.get("supported_content_types")
    if not isinstance(sct, list) or len(sct) == 0:
        errors.append("Missing or empty required field: supported_content_types")

    # Required: pqc_ready
    if not isinstance(obj.get("pqc_ready"), bool):
        errors.append("Missing required field: pqc_ready (must be boolean)")

    # Required: x402_enabled
    if not isinstance(obj.get("x402_enabled"), bool):
        errors.append("Missing required field: x402_enabled (must be boolean)")

    # Optional: signing_algorithms
    sa = obj.get("signing_algorithms")
    if sa is not None:
        if not isinstance(sa, list) or len(sa) == 0:
            errors.append("signing_algorithms must be a non-empty array")
        else:
            for alg in sa:
                if alg not in VALID_SIGNING_ALGORITHMS:
                    errors.append(f"Unknown signing algorithm: '{alg}'")

    # Optional: tls_mode
    tm = obj.get("tls_mode")
    if tm is not None and tm not in VALID_TLS_MODES:
        errors.append(f"Invalid tls_mode: '{tm}' — must be one of: {', '.join(sorted(VALID_TLS_MODES))}")

    # Optional: pricing_mode
    pm = obj.get("pricing_mode")
    if pm is not None and pm not in VALID_PRICING_MODES:
        errors.append(f"Invalid pricing_mode: '{pm}' — must be one of: {', '.join(sorted(VALID_PRICING_MODES))}")

    if errors:
        return ManifestValidationResult(valid=False, errors=errors)

    return ManifestValidationResult(valid=True, errors=[], manifest=obj)


# ─── Link Header Parsing ─────────────────────────────────────────────

@dataclass
class EEPLinkInfo:
    url: str
    rel: str
    type: Optional[str] = None


def parse_link_header(header_value: Optional[str]) -> List[EEPLinkInfo]:
    """Parse Link header and extract EEP-relevant links (rel=eep, rel=subscribe)."""
    if not header_value:
        return []

    results: List[EEPLinkInfo] = []
    eep_rels = {"eep", "subscribe"}

    for part in _split_links(header_value):
        url_match = re.search(r"<([^>]+)>", part)
        if not url_match:
            continue
        url = url_match.group(1)

        rel_match = re.search(r'rel="([^"]+)"', part, re.IGNORECASE)
        if not rel_match:
            continue
        rel = rel_match.group(1).lower()
        if rel not in eep_rels:
            continue

        type_match = re.search(r'type="([^"]+)"', part, re.IGNORECASE)
        info = EEPLinkInfo(url=url, rel=rel)
        if type_match:
            info.type = type_match.group(1)
        results.append(info)

    return results


def _split_links(value: str) -> List[str]:
    """Split Link header by commas outside angle brackets."""
    parts: List[str] = []
    current = ""
    in_bracket = False

    for ch in value:
        if ch == "<":
            in_bracket = True
        if ch == ">":
            in_bracket = False
        if ch == "," and not in_bracket:
            parts.append(current.strip())
            current = ""
        else:
            current += ch

    if current.strip():
        parts.append(current.strip())
    return parts


# ─── DNS TXT Record Parsing ──────────────────────────────────────────

@dataclass
class DnsTxtResult:
    valid: bool
    version: Optional[str] = None
    manifest_url: Optional[str] = None
    error: Optional[str] = None


def parse_dns_txt_record(txt_record: Optional[str]) -> DnsTxtResult:
    """Parse an EEP DNS TXT record. Expected format: 'v=eep1; manifest=https://...'."""
    if not txt_record or not isinstance(txt_record, str):
        return DnsTxtResult(valid=False, error="Empty or missing TXT record")

    trimmed = txt_record.strip()
    pairs: Dict[str, str] = {}
    for segment in trimmed.split(";"):
        eq_idx = segment.find("=")
        if eq_idx == -1:
            continue
        key = segment[:eq_idx].strip().lower()
        value = segment[eq_idx + 1:].strip()
        pairs[key] = value

    version = pairs.get("v")
    if not version:
        return DnsTxtResult(valid=False, error="Missing required field: v (version)")
    if not version.startswith("eep"):
        return DnsTxtResult(valid=False, error=f"Invalid version prefix: '{version}' — must start with 'eep'")

    manifest_url = pairs.get("manifest")
    if not manifest_url:
        return DnsTxtResult(valid=False, error="Missing required field: manifest")
    if not manifest_url.startswith("https://"):
        return DnsTxtResult(valid=False, error=f"Manifest URL must use HTTPS: '{manifest_url}'")

    return DnsTxtResult(valid=True, version=version, manifest_url=manifest_url)
