from eep_mcp_bridge.bridge import (
    evaluate_mcp_call_access,
    to_eep_manifest,
    to_gate_config,
    to_service_catalog,
    validate_bridge_config,
)
from eep_mcp_bridge import cli as bridge_cli


def test_validate_bridge_config_success():
    cfg = validate_bridge_config(
        {
            "did": "did:web:bridge.eep.dev",
            "base_url": "http://localhost:3001",
            "mcp_base_url": "http://localhost:4100",
        }
    )
    assert cfg["did"] == "did:web:bridge.eep.dev"


def test_validate_bridge_config_rejects_invalid_did():
    try:
        validate_bridge_config(
            {"did": "invalid", "base_url": "http://localhost:3001", "mcp_base_url": "http://localhost:4100"}
        )
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "Invalid DID format" in str(exc)


def test_validate_bridge_config_rejects_non_dict():
    try:
        validate_bridge_config("not-dict")  # type: ignore[arg-type]
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "must be an object" in str(exc)


def test_validate_bridge_config_rejects_missing_field():
    try:
        validate_bridge_config({"did": "did:web:ok", "base_url": "http://localhost"})
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "mcp_base_url" in str(exc)


def test_validate_bridge_config_rejects_bad_url():
    try:
        validate_bridge_config({"did": "did:web:ok", "base_url": "ftp://localhost", "mcp_base_url": "http://ok"})
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "base_url must be an absolute http(s) URL" in str(exc)


def test_manifest_mapping():
    cfg = {
        "did": "did:web:bridge.eep.dev",
        "base_url": "http://localhost:3001",
        "mcp_base_url": "http://localhost:4100",
    }
    introspection = {
        "server": {"name": "mcp-x"},
        "tools": [{"name": "search"}],
        "resources": [{"uri": "res://x", "mimeType": "text/plain"}],
    }
    out = to_eep_manifest(cfg, introspection)
    assert out["did"] == "did:web:bridge.eep.dev"
    assert "text/plain" in out["supported_content_types"]


def test_service_catalog_mapping():
    out = to_service_catalog({"tools": [{"name": "search"}]})
    assert len(out["services"]) == 1
    assert out["services"][0]["id"] == "search"


def test_gate_config_annotation_mapping():
    gate = to_gate_config(
        {"gated_tools": {}, "did": "did:web:x", "base_url": "http://localhost", "mcp_base_url": "http://mcp"},
        {"tools": [{"name": "premium", "annotations": {"price_usd": 2}}]},
    )
    req = gate["tiers"]["tool_premium"]["requirements"][0]
    assert req["type"] == "payment"
    assert req["currency"] == "usd"


def test_gate_config_override_variants():
    cfg = {"did": "did:web:x", "base_url": "http://localhost", "mcp_base_url": "http://mcp"}
    introspection = {"tools": [{"name": "t"}]}

    agreement = to_gate_config({**cfg, "gated_tools": {"t": {"type": "agreement"}}}, introspection)
    assert agreement["tiers"]["tool_t"]["requirements"][0]["type"] == "agreement"

    credential = to_gate_config(
        {**cfg, "gated_tools": {"t": {"type": "credential", "credential_type": "Role"}}}, introspection
    )
    assert credential["tiers"]["tool_t"]["requirements"][0]["credential_type"] == "Role"

    public = to_gate_config({**cfg, "gated_tools": {"t": {"type": "public"}}}, introspection)
    assert public["tiers"]["tool_t"]["requirements"] == []

    payment = to_gate_config({**cfg, "gated_tools": {"t": {"type": "payment", "amount": 7, "currency": "USD"}}}, introspection)
    assert payment["tiers"]["tool_t"]["requirements"][0]["amount"] == 7
    assert payment["tiers"]["tool_t"]["requirements"][0]["currency"] == "usd"


def test_gate_config_annotation_variants():
    cfg = {"did": "did:web:x", "base_url": "http://localhost", "mcp_base_url": "http://mcp", "gated_tools": {}}

    read_only = to_gate_config(cfg, {"tools": [{"name": "a", "annotations": {"readOnlyHint": True}}]})
    assert read_only["tiers"]["tool_a"]["requirements"] == []

    destructive = to_gate_config(cfg, {"tools": [{"name": "b", "annotations": {"destructiveHint": True}}]})
    assert destructive["tiers"]["tool_b"]["requirements"][0]["type"] == "agreement"

    required_cred = to_gate_config(cfg, {"tools": [{"name": "c", "annotations": {"required_credential": "Role"}}]})
    assert required_cred["tiers"]["tool_c"]["requirements"][0]["credential_type"] == "Role"

    plain = to_gate_config(cfg, {"tools": [{"name": "plain"}]})
    assert plain["tiers"]["tool_plain"]["requirements"] == []


def test_evaluate_access_denied_without_proof():
    gate = {
        "default_tier": "public",
        "tiers": {
            "public": {"access": ["eep.services.list"], "requirements": []},
            "tool_premium": {
                "access": ["mcp.tools.call.premium"],
                "requirements": [{"type": "payment", "amount": 1, "currency": "usd", "per": "request"}],
            },
        },
    }
    out = evaluate_mcp_call_access(gate, "premium", [])
    assert out["granted"] is False
    assert out["status"] == 402


def test_evaluate_access_allowed_with_proof():
    gate = {
        "default_tier": "public",
        "tiers": {
            "public": {"access": ["eep.services.list"], "requirements": []},
            "tool_premium": {
                "access": ["mcp.tools.call.premium"],
                "requirements": [{"type": "payment", "amount": 1, "currency": "usd", "per": "request"}],
            },
        },
    }
    out = evaluate_mcp_call_access(gate, "premium", [{"type": "payment", "token": "x402"}])
    assert out["granted"] is True
    assert out["status"] == 200


def test_invalid_tool_name_rejected():
    gate = {"default_tier": "public", "tiers": {}}
    out = evaluate_mcp_call_access(gate, "../../etc/passwd", [])
    assert out["granted"] is False
    assert out["status"] == 400
    assert out["body"]["error"] == "invalid_tool_name"


def test_access_defaults_to_allowed_for_unknown_tool():
    gate = {"default_tier": "public", "tiers": {"public": {"access": [], "requirements": []}}}
    out = evaluate_mcp_call_access(gate, "unknown", [])
    assert out["status"] == 200


def test_mismatched_proof_type_does_not_satisfy_requirement():
    gate = {
        "default_tier": "public",
        "tiers": {
            "public": {"access": [], "requirements": []},
            "tool_pay": {"access": ["mcp.tools.call.pay"], "requirements": [{"type": "payment"}]},
        },
    }
    out = evaluate_mcp_call_access(gate, "pay", [{"type": "credential", "credential": "vc"}])
    assert out["status"] == 402


def test_agreement_and_credential_proofs_are_accepted():
    gate = {
        "default_tier": "public",
        "tiers": {
            "public": {"access": [], "requirements": []},
            "tool_agree": {"access": ["mcp.tools.call.agree"], "requirements": [{"type": "agreement"}]},
            "tool_cred": {"access": ["mcp.tools.call.cred"], "requirements": [{"type": "credential"}]},
        },
    }
    agree = evaluate_mcp_call_access(gate, "agree", [{"type": "agreement", "signature": "sig"}])
    assert agree["status"] == 200
    cred = evaluate_mcp_call_access(gate, "cred", [{"type": "credential", "credential": "vc.jwt"}])
    assert cred["status"] == 200


def test_cli_validate_config(monkeypatch, tmp_path, capsys):
    config_file = tmp_path / "bridge.config.json"
    config_file.write_text(
        '{"did":"did:web:bridge.eep.dev","base_url":"http://localhost:1","mcp_base_url":"http://localhost:2"}',
        encoding="utf-8",
    )
    monkeypatch.setattr("sys.argv", ["eep-mcp-bridge", "validate-config", "--config", str(config_file)])
    bridge_cli.main()
    out = capsys.readouterr().out
    assert '"valid": true' in out
