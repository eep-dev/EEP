#!/usr/bin/env python3
# Copyright 2026 EEP Contributors — Apache-2.0
"""
EEP Gate Subscriber Example — Python

Demonstrates the full gate subscriber flow:
  1. Discover gate configuration from a publisher
  2. Attempt to access a gated resource (receive 402)
  3. Parse the 402 response to understand requirements
  4. Submit proofs to gain access
  5. Browse the service catalog
  6. Handle an agreement gate (license signature)
  7. Handle a data_request gate (W3C DPV)

Usage:
    pip install httpx
    python client.py                                    # default: http://localhost:3002
    EEP_PUBLISHER_URL=https://publisher.example python client.py
"""

from __future__ import annotations

import json
import os
import sys
import hashlib

import httpx

PUBLISHER_URL = os.environ.get("EEP_PUBLISHER_URL", "http://localhost:3002")
ENTITY_DID = "did:web:example.com:u:test-entity"


def main() -> None:
    client = httpx.Client(base_url=PUBLISHER_URL, timeout=10.0)
    print(f"🔗 EEP Gate Subscriber — connecting to {PUBLISHER_URL}\n")

    # ── Step 1: Discover gate configuration ──────────────────────
    print("━━━ Step 1: Discover Gate Configuration ━━━")
    r = client.get(f"/eep/gates/{ENTITY_DID}")
    if r.status_code != 200:
        print(f"❌ Failed to fetch gate config: {r.status_code}")
        sys.exit(1)

    gate_config = r.json()
    default_tier = gate_config["default_tier"]
    tiers = gate_config["tiers"]
    print(f"   Default tier: {default_tier}")
    print(f"   Available tiers: {', '.join(tiers.keys())}")

    for key, tier in tiers.items():
        reqs = tier.get("requirements", [])
        access = tier.get("access", [])
        label = tier.get("label", key)
        if reqs:
            req_types = [r["type"] for r in reqs]
            print(f"   📋 {label}: requires [{', '.join(req_types)}] → access {access}")
        else:
            print(f"   📋 {label}: open access → {access}")
    print()

    # ── Step 2: Attempt gated resource (expect 402) ──────────────
    resource_path = "content.papers.full_text"
    print(f"━━━ Step 2: Access Gated Resource ({resource_path}) ━━━")

    r = client.get(f"/eep/content/{ENTITY_DID}/{resource_path}")
    print(f"   Status: {r.status_code}")

    if r.status_code == 200:
        print("   ✅ Resource accessible without proofs (public tier)")
        data = r.json()
        print(f"   Content: {json.dumps(data, indent=2)}")
        return

    if r.status_code != 402:
        print(f"   ❌ Unexpected status code: {r.status_code}")
        sys.exit(1)

    # ── Step 3: Parse 402 response ───────────────────────────────
    print()
    print("━━━ Step 3: Parse 402 Response ━━━")
    error_body = r.json()
    print(f"   Error: {error_body.get('error')}")
    print(f"   Current tier: {error_body.get('current_tier')}")
    print(f"   Required tier: {error_body.get('required_tier')}")

    unmet = error_body.get("unmet_requirements", [])
    if unmet:
        print(f"   Unmet requirements ({len(unmet)}):")
        for req in unmet:
            hint = req.get("resolution_hint", "no hint")
            print(f"     • {req['type']}: {hint}")

    available = error_body.get("available_tiers", {})
    if available:
        print(f"   Available tiers to upgrade:")
        for tier_key, tier_info in available.items():
            label = tier_info.get("label", tier_key)
            reqs = tier_info.get("requirements", [])
            print(f"     • {label}: {[r['type'] for r in reqs]}")
    print()

    # ── Step 4: Submit proofs ────────────────────────────────────
    print("━━━ Step 4: Submit Proofs and Retry ━━━")

    # Build proofs based on unmet requirements
    proofs: list[dict] = []
    for req in unmet:
        match req["type"]:
            case "payment":
                proofs.append({"type": "payment", "token": "tok_demo_payment"})
                print(f"   🔑 Adding payment proof (token: tok_demo_payment)")
            case "trust":
                proofs.append({"type": "trust", "self_attested": True})
                print(f"   🔑 Adding trust proof (self-attested)")
            case "identity":
                proofs.append({"type": "identity", "method": "did_verified"})
                print(f"   🔑 Adding identity proof (did_verified)")
            case "credential":
                proofs.append({
                    "type": "credential",
                    "credential": "eyJhbGciOiJFZERTQSJ9.demo.sig",
                    "format": "jwt_vc",
                })
                print(f"   🔑 Adding credential proof (jwt_vc)")
            case "agreement":
                # §8.1: Sign SHA-256 hash of the license document
                license_url = req.get("license_url", "https://example.com/license.txt")
                license_hash = hashlib.sha256(license_url.encode()).hexdigest()
                proofs.append({
                    "type": "agreement",
                    "license_url": license_url,
                    "license_hash": license_hash,
                    "signature": f"ed25519:demo_sig_{license_hash[:16]}",
                    "signer_did": ENTITY_DID,
                })
                print(f"   🔑 Adding agreement proof (license hash: {license_hash[:16]}...)")
            case "data_request":
                # §7.1: Provide requested claims with W3C DPV purpose
                requested_claims = req.get("requested_claims", [])
                claims_data = {}
                for claim in requested_claims:
                    claim_name = claim.get("claim", "unknown")
                    purpose = claim.get("purpose", "unspecified")
                    print(f"   📊 Claim ‘{claim_name}’ requested for purpose: {purpose}")
                    claims_data[claim_name] = f"demo_value_for_{claim_name}"
                proofs.append({
                    "type": "data_request",
                    "verifiable_presentation": {
                        "@context": ["https://www.w3.org/2018/credentials/v1"],
                        "type": ["VerifiablePresentation"],
                        "verifiableCredential": [{
                            "type": ["VerifiableCredential"],
                            "credentialSubject": claims_data,
                            "issuer": ENTITY_DID,
                        }],
                    },
                    "consent_timestamp": "2026-03-05T12:00:00Z",
                })
                print(f"   🔑 Adding data_request proof ({len(claims_data)} claims)")
            case _:
                print(f"   ⚠️  Unsupported requirement type: {req['type']}")

    if not proofs:
        print("   ❌ No proofs to submit")
        sys.exit(1)

    # Retry with proofs
    r = client.get(
        f"/eep/content/{ENTITY_DID}/{resource_path}",
        headers={"X-EEP-Proofs": json.dumps(proofs)},
    )
    print(f"\n   Retry status: {r.status_code}")

    if r.status_code == 200:
        data = r.json()
        print(f"   ✅ Access granted at tier: {data.get('tier')}")
        print(f"   Content: {data.get('content')}")
    elif r.status_code == 402:
        data = r.json()
        still_unmet = data.get("unmet_requirements", [])
        print(f"   ⚠️  Still denied — {len(still_unmet)} unmet requirements remain")
        for req in still_unmet:
            print(f"     • {req['type']}: {req.get('resolution_hint', '')}")
    else:
        print(f"   ❌ Unexpected: {r.status_code}")
    print()

    # ── Step 5: Browse service catalog ───────────────────────────
    print("━━━ Step 5: Browse Service Catalog ━━━")
    r = client.get(f"/eep/services/{ENTITY_DID}")
    if r.status_code == 200:
        catalog = r.json()
        services = catalog.get("services", [])
        print(f"   Entity: {catalog.get('entity_did')}")
        print(f"   {len(services)} service(s) available:")
        for svc in services:
            price = svc.get("pricing", {})
            amt = price.get("amount", "?")
            cur = price.get("currency", "?")
            model = price.get("model", "?")
            print(f"     • {svc['name']} ({svc['id']})")
            print(f"       {model}: {amt} {cur} | delivery: {svc.get('delivery')}")
            if svc.get("negotiable"):
                print(f"       💬 Negotiable")
    else:
        print(f"   ⚠️  Service catalog not available: {r.status_code}")

    # ── Step 6: Agreement gate demo ───────────────────────────────
    print("\n━━━ Step 6: Agreement Gate Flow (§8.1) ━━━")
    print("   ℹ️  Agreement gates require signing the SHA-256 hash of a license document.")
    license_doc_url = "https://example.com/terms/data-access-v2.txt"
    license_hash = hashlib.sha256(license_doc_url.encode()).hexdigest()
    agreement_proof = {
        "type": "agreement",
        "license_url": license_doc_url,
        "license_hash": license_hash,
        "signature": f"ed25519:demo_sig_{license_hash[:16]}",
        "signer_did": ENTITY_DID,
    }
    print(f"   📝 License URL: {license_doc_url}")
    print(f"   🔐 Hash:        {license_hash[:32]}...")
    print(f"   ✅ Agreement proof constructed (would submit with X-EEP-Proofs header)")

    # ── Step 7: Data request gate demo ────────────────────────────
    print("\n━━━ Step 7: Data Request Gate Flow (§7.1 — W3C DPV) ━━━")
    print("   ℹ️  Data request gates exchange structured claims with declared purposes.")
    print("   📊 Example requested claims:")
    example_claims = [
        {"claim": "organization_name", "purpose": "ServicePersonalisation", "retention_days": 90},
        {"claim": "agent_capabilities",  "purpose": "ServiceProvision",         "retention_days": 30},
    ]
    for claim in example_claims:
        print(f"     • {claim['claim']} — purpose: {claim['purpose']}, retention: {claim['retention_days']}d")

    data_request_proof = {
        "type": "data_request",
        "verifiable_presentation": {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiablePresentation"],
            "verifiableCredential": [{
                "type": ["VerifiableCredential"],
                "credentialSubject": {
                    "organization_name": "Acme Corp",
                    "agent_capabilities": ["data-analysis", "report-generation"],
                },
                "issuer": ENTITY_DID,
            }],
        },
        "consent_timestamp": "2026-03-05T12:00:00Z",
    }
    print(f"   ✅ VP constructed with {len(example_claims)} claims (would submit with X-EEP-Proofs header)")

    print("\n✅ Gate subscriber flow complete (all gate types demonstrated)")


if __name__ == "__main__":
    main()
