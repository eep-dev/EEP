import json
from pathlib import Path

from eep_mcp_bridge.bridge import evaluate_mcp_call_access, to_eep_manifest, to_gate_config


def load_fixtures():
    root = Path(__file__).resolve().parents[3]
    with (root / "tests" / "parity" / "mcp-bridge-fixtures.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def test_manifest_parity_fixture():
    fixtures = load_fixtures()
    case = fixtures["manifest_case"]
    manifest = to_eep_manifest(case["config"], case["introspection"])
    assert manifest["did"] == case["expect"]["did"]
    assert ("text/plain" in manifest["supported_content_types"]) is case["expect"]["has_text_plain"]


def test_gate_decision_parity_fixture():
    fixtures = load_fixtures()
    manifest_case = fixtures["manifest_case"]
    gate_case = fixtures["gate_case"]
    gate = to_gate_config(manifest_case["config"], manifest_case["introspection"])
    denied = evaluate_mcp_call_access(gate, gate_case["tool"], [])
    assert denied["status"] == gate_case["expect_missing_status"]
    allowed = evaluate_mcp_call_access(gate, gate_case["tool"], gate_case["proofs"])
    assert allowed["status"] == gate_case["expect_with_proof_status"]
