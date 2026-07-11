"""
EEP Client calling gated SEC Edgar tools.
Handles 402 Payment Required challenge with mock payment.
"""

from __future__ import annotations

import json
import httpx

BRIDGE_URL = "http://localhost:3005"
USER_AGENT = "Test-Project info@test.com"

def main() -> None:
    client = httpx.Client(base_url=BRIDGE_URL, timeout=60.0)
    print("Connecting to SEC Edgar EEP-MCP Bridge...")

    # 1. Manifest Discovery
    r = client.get("/.well-known/eep.json")
    print(f"Discovered Manifest! Publisher DID: {r.json()['did']}")

    # 2. Service Catalog Introspection
    r = client.get("/eep/services")
    tools = [s["id"] for s in r.json()["services"]]
    print(f"Introspected {len(tools)} tools: {', '.join(tools)}\n")

    # 3. Call the gated facts tool
    payload = {
        "name": "get_company_facts_tool",
        "arguments": {
            "ticker": "AAPL",
            "user_agent":USER_AGENT
        }
    }
    
    print("=== Step 1: Attempt to Call SEC Tool ===")
    r = client.post("/mcp/tools/call", json=payload)
    print(f"Status: {r.status_code}")
    
    if r.status_code == 402:
        error_body = r.json()
        print(f"Access Restricted! Required Tier: {error_body['required_tier']}")
        unmet = error_body["unmet_requirements"]
        print(f"   Unmet requirements: {[u['type'] for u in unmet]}")
        
        # Resolve payment gate requirement
        print("\n=== Step 2: Build & Attach Proofs ===")
        proofs = []
        for req in unmet:
            if req["type"] == "payment":
                print("Fulfilling payment requirement (Mock USDC token)...")
                proofs.append({
                    "type": "payment",
                    "token": "tok_demo_usdc_0.01"
                })
        
        payload["gate_proofs"] = proofs
        
        # Retry call
        print("\n=== Step 3: Retry Call with Gate Proofs ===")
        r = client.post("/mcp/tools/call", json=payload)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            result = r.json()["result"]
            print("Access Granted!")
            print(f"Result: {json.dumps(result, indent=2, ensure_ascii=False)}...\n")
        else:
            print(f"Failed: {r.text}")

    elif r.status_code == 200:
        print(f"Response from Edgar API:\n{r.json()}")


if __name__ == "__main__":
    main()
