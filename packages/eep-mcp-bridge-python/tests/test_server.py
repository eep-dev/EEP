import json
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from eep_mcp_bridge import cli as bridge_cli
from eep_mcp_bridge.bridge import (
    build_bridge_artifacts,
    call_mcp_tool,
    fetch_mcp_introspection,
    load_bridge_config,
    run_bridge_server,
)


class MockMCP(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/tools/list":
            body = {
                "server": {"name": "mock-mcp", "version": "1.0.0"},
                "tools": [
                    {"name": "search_profiles", "annotations": {"price_usd": 2}},
                    {"name": "get_profile", "annotations": {"readOnlyHint": True}},
                ],
            }
        elif self.path == "/resources/list":
            body = {"resources": [{"uri": "res://schema", "mimeType": "application/schema+json"}]}
        else:
            self.send_response(404)
            self.end_headers()
            return
        raw = json.dumps(body).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):  # noqa: N802
        if self.path != "/tools/call":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        raw = json.dumps({"ok": True, "echo": payload}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, _format, *_args):
        return


def _start_server(handler_cls):
    server = HTTPServer(("127.0.0.1", 0), handler_cls)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread


def _json_request(method: str, url: str, payload=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = Request(url, method=method, data=body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            return resp.status, content_type, data.decode("utf-8")
    except HTTPError as exc:
        data = exc.read()
        content_type = exc.headers.get("Content-Type", "")
        return exc.code, content_type, data.decode("utf-8")


def _raw_request(method: str, url: str, raw_body: bytes):
    req = Request(url, method=method, data=raw_body, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def _empty_request(method: str, url: str):
    req = Request(url, method=method, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")


def test_introspection_and_call_tool_and_artifacts(tmp_path):
    mcp_server, _ = _start_server(MockMCP)
    base = f"http://127.0.0.1:{mcp_server.server_address[1]}"

    config_file = tmp_path / "bridge.config.json"
    config_file.write_text(
        json.dumps(
            {"did": "did:web:bridge.eep.dev", "base_url": "http://localhost:3001", "mcp_base_url": base}
        ),
        encoding="utf-8",
    )

    cfg = load_bridge_config(str(config_file))
    introspection = fetch_mcp_introspection(cfg)
    assert introspection["server"]["name"] == "mock-mcp"
    assert len(introspection["tools"]) == 2

    artifacts = build_bridge_artifacts(cfg, introspection)
    assert artifacts["manifest"]["did"] == "did:web:bridge.eep.dev"
    assert len(artifacts["services"]["services"]) == 2
    assert "tool_search_profiles" in artifacts["gates"]["tiers"]

    call_result = call_mcp_tool(cfg, "search_profiles", {"q": "ai"})
    assert call_result["ok"] is True
    assert call_result["echo"]["name"] == "search_profiles"

    mcp_server.shutdown()
    mcp_server.server_close()


def test_run_bridge_server_end_to_end():
    mcp_server, _ = _start_server(MockMCP)
    mcp_base = f"http://127.0.0.1:{mcp_server.server_address[1]}"
    bridge_config = {
        "did": "did:web:bridge.eep.dev",
        "base_url": "http://127.0.0.1:3011",
        "mcp_base_url": mcp_base,
        "gated_tools": {"get_profile": {"type": "public"}},
    }

    bridge_thread = threading.Thread(
        target=run_bridge_server,
        kwargs={"config": bridge_config, "host": "127.0.0.1", "port": 3011},
        daemon=True,
    )
    bridge_thread.start()
    time.sleep(0.2)

    status, ctype, body = _json_request("GET", "http://127.0.0.1:3011/.well-known/eep.json")
    assert status == 200
    assert "application/json" in ctype
    assert json.loads(body)["eep_version"] == "0.1"
    status, _, _ = _json_request("GET", "http://127.0.0.1:3011/eep/services")
    assert status == 200
    status, _, _ = _json_request("GET", "http://127.0.0.1:3011/eep/gates")
    assert status == 200

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/eep/subscribe",
        {"source_did": "did:web:src", "delivery_method": "sse"},
    )
    assert status == 200
    assert json.loads(body)["status"] == "active"

    status, ctype, body = _json_request("GET", "http://127.0.0.1:3011/eep/stream")
    assert status == 200
    assert "text/event-stream" in ctype
    assert "event:" in body
    status, _, _ = _json_request("GET", "http://127.0.0.1:3011/no-such-endpoint")
    assert status == 404

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/mcp/tools/call",
        {"name": "search_profiles", "arguments": {"q": "x"}},
    )
    assert status == 402
    assert json.loads(body)["error"] == "access_restricted"

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/mcp/tools/call",
        {"name": "search_profiles", "arguments": {"q": "x"}, "gate_proofs": [{"type": "payment", "token": "ok"}]},
    )
    assert status == 200
    assert json.loads(body)["ok"] is True

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/mcp/tools/call",
        {"name": "search_profiles", "arguments": {"q": "x"}, "gate_proofs": {"type": "payment"}},
    )
    assert status == 402

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/mcp/tools/call",
        {"name": "../../etc/passwd", "arguments": {}},
    )
    assert status == 400
    assert json.loads(body)["error"] == "invalid_tool_name"

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/mcp/tools/call",
        {"name": "unknown_tool", "arguments": {}},
    )
    assert status == 404
    assert json.loads(body)["error"] == "unknown_tool"

    status, _, body = _json_request(
        "POST",
        "http://127.0.0.1:3011/eep/subscribe",
        {"delivery_method": "webhook", "callback_url": "https://example.com/hook"},
    )
    assert status == 200
    assert json.loads(body)["status"] == "pending_verification"

    status, body = _raw_request("POST", "http://127.0.0.1:3011/eep/subscribe", b"   ")
    assert status == 200
    assert json.loads(body)["status"] == "active"

    status, body = _empty_request("POST", "http://127.0.0.1:3011/eep/subscribe")
    assert status == 200
    assert json.loads(body)["status"] == "active"

    status, _, body = _json_request("POST", "http://127.0.0.1:3011/unknown", {})
    assert status == 404

    mcp_server.shutdown()
    mcp_server.server_close()


def test_http_json_error_paths():
    try:
        fetch_mcp_introspection({"mcp_base_url": "http://127.0.0.1:1"})
        assert False, "Expected RuntimeError"
    except RuntimeError as exc:
        assert "Network error" in str(exc)

    class ErrorMCP(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(500)
            self.end_headers()

        def log_message(self, _format, *_args):
            return

    server, _ = _start_server(ErrorMCP)
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        fetch_mcp_introspection({"mcp_base_url": base})
        assert False, "Expected RuntimeError"
    except RuntimeError as exc:
        assert "HTTP 500" in str(exc)
    finally:
        server.shutdown()
        server.server_close()


def test_cli_export_manifest_and_start(monkeypatch, tmp_path, capsys):
    mcp_server, _ = _start_server(MockMCP)
    base = f"http://127.0.0.1:{mcp_server.server_address[1]}"

    config_file = tmp_path / "bridge.config.json"
    config_file.write_text(
        json.dumps(
            {"did": "did:web:bridge.eep.dev", "base_url": "http://localhost:3001", "mcp_base_url": base}
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "sys.argv", ["eep-mcp-bridge", "export-manifest", "--config", str(config_file)]
    )
    bridge_cli.main()
    out = capsys.readouterr().out
    assert '"manifest"' in out
    assert '"services"' in out
    assert '"gates"' in out

    monkeypatch.setattr(
        "sys.argv", ["eep-mcp-bridge", "dry-run", "--config", str(config_file)]
    )
    bridge_cli.main()
    out = capsys.readouterr().out
    assert '"manifest"' in out

    called = {}

    def fake_run(cfg, host, port):
        called["did"] = cfg["did"]
        called["host"] = host
        called["port"] = port

    monkeypatch.setattr("eep_mcp_bridge.cli.run_bridge_server", fake_run)
    monkeypatch.setattr(
        "sys.argv",
        ["eep-mcp-bridge", "start", "--config", str(config_file), "--host", "127.0.0.1", "--port", "3999"],
    )
    bridge_cli.main()
    assert called["did"] == "did:web:bridge.eep.dev"
    assert called["host"] == "127.0.0.1"
    assert called["port"] == 3999

    mcp_server.shutdown()
    mcp_server.server_close()
