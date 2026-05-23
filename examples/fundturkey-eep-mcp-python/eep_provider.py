"""
FundTurkey (TEFAS) EEP-MCP Provider.
Exposes FastMCP tools as gated, secure EEP endpoints.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import asyncio
from eep_mcp_bridge.bridge import run_bridge_server

from mcp_server import mcp

tools_from_mcp = asyncio.run(mcp.list_tools())
resources_from_mcp = asyncio.run(mcp.list_resources())


class FastMCPHttpAdapter(BaseHTTPRequestHandler):
    """Wraps FastMCP server instance and exposes standard HTTP endpoints."""

    def do_GET(self) -> None:
        if self.path == "/tools/list":
            tools_list = []
            for tool in tools_from_mcp:
                schema = {}
                if hasattr(tool, "input_model") and tool.input_model:
                    if hasattr(tool.input_model, "model_json_schema"):
                        schema = tool.input_model.model_json_schema()
                    elif hasattr(tool.input_model, "schema"):
                        schema = tool.input_model.schema()

                tools_list.append({
                    "name": tool.name,
                    "description": tool.description or "",
                    "inputSchema": schema
                })
            
            body = {
                "server": {"name": mcp.name, "version": "1.0.0"},
                "tools": tools_list
            }
        elif self.path == "/resources/list":
            resources_list = []
            for resource in resources_from_mcp:
                resources_list.append({
                    "uri": resource.uri,
                    "name": resource.name,
                    "description": resource.description or "",
                    "mimeType": resource.mime_type or "application/json"
                })
            body = {"resources": resources_list}
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

    def do_POST(self) -> None:
        if self.path != "/tools/call":
            self.send_response(404)
            self.end_headers()
            return
            
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        tool_name = payload.get("name")
        arguments = payload.get("arguments") or {}
        tool = next((t for t in tools_from_mcp if t.name == tool_name), None)
        if not tool:
            self.send_response(404)
            self.end_headers()
            return
            
        try:
            # Call the python function directly
            result = tool.fn(**arguments)
            body = {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}
            
            raw = json.dumps(body).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except Exception as e:
            body = {"isError": True, "content": [{"type": "text", "text": str(e)}]}
            raw = json.dumps(body).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            
    def log_message(self, _format, *_args) -> None:
        return


def start_adapter(port: int = 8001) -> HTTPServer:
    server = HTTPServer(("127.0.0.1", port), FastMCPHttpAdapter)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"🔌 FastMCP HTTP Adapter running on http://localhost:{port}")
    return server


def main() -> None:
    # 1. Start the HTTP proxy for the FastMCP instance
    adapter_port = 8001
    adapter = start_adapter(adapter_port)
    
    # 2. Configure the EEP bridge
    config = {
<<<<<<< HEAD
        "did": "did:web:fundturkey.mcp.ai",
=======
        "did": "did:web:fundturkey.eep-dev.org",
>>>>>>> 7036636 (virtuel-tech-guru: As the realistic data provider I have provided my mcp server created specifically for fundturkey platform. EEP makes it available as the main tooling source to bring fund related data and put this context into agentic evaluation on investment decisions)
        "base_url": "http://localhost:3005",
        "mcp_base_url": f"http://localhost:{adapter_port}",
        
        # Configure business rules and Gates for specific FundTurkey tools
        "gated_tools": {
            # Gating fund comparison with a Payment Gate (0.05 USD)
            "get_fund_comparison_tool": {
                "type": "payment",
                "amount": 0.05,
                "currency": "usd"
            },
            # Gating general returns with an Agreement Gate (Terms of Service)
            "get_fund_returns_tool": {
                "type": "agreement"
            }
        }
    }
    
    # 3. Start EEP-MCP Bridge on port 3005
    try:
        run_bridge_server(config, host="0.0.0.0", port=3005)
    except KeyboardInterrupt:
        print("\nStopping servers...")
        adapter.shutdown()
        adapter.server_close()


if __name__ == "__main__":
    main()
