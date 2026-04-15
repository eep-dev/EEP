from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import re

TOOL_NAME_RE = re.compile(r"^[a-zA-Z0-9._:-]{1,128}$")


def validate_bridge_config(config: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(config, dict):
        raise ValueError("Bridge config must be an object")

    for field in ("did", "base_url", "mcp_base_url"):
        value = config.get(field)
        if not isinstance(value, str) or not value:
            raise ValueError(f"Missing required config field: {field}")

    if not str(config["did"]).startswith("did:"):
        raise ValueError("Invalid DID format in config.did")

    for field in ("base_url", "mcp_base_url"):
        value = str(config[field])
        if not (value.startswith("http://") or value.startswith("https://")):
            raise ValueError(f"{field} must be an absolute http(s) URL")

    return config


def load_bridge_config(path: str) -> Dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    parsed = json.loads(raw)
    return validate_bridge_config(parsed)


def _http_json(url: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    body = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = Request(url, method=method, headers=headers, data=body)
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} calling {url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Network error calling {url}: {exc}") from exc


def fetch_mcp_introspection(config: Dict[str, Any]) -> Dict[str, Any]:
    base = str(config["mcp_base_url"]).rstrip("/")
    tools = _http_json(f"{base}/tools/list")
    resources = _http_json(f"{base}/resources/list")
    return {
        "server": {
            "name": ((tools.get("server") or {}).get("name") or "mcp-server"),
            "version": (tools.get("server") or {}).get("version"),
        },
        "tools": tools.get("tools") if isinstance(tools.get("tools"), list) else [],
        "resources": resources.get("resources") if isinstance(resources.get("resources"), list) else [],
    }


def call_mcp_tool(config: Dict[str, Any], name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    base = str(config["mcp_base_url"]).rstrip("/")
    out = _http_json(f"{base}/tools/call", method="POST", payload={"name": name, "arguments": arguments})
    return out


def build_bridge_artifacts(config: Dict[str, Any], introspection: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "manifest": to_eep_manifest(config, introspection),
        "services": to_service_catalog(introspection),
        "gates": to_gate_config(config, introspection),
    }


def _requirement_from_tool(tool: Dict[str, Any], gated_tools: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    name = str(tool.get("name", ""))
    override = (gated_tools or {}).get(name)
    if override:
        t = override.get("type")
        if t == "public":
            return None
        if t == "payment":
            return {
                "type": "payment",
                "amount": override.get("amount", 1),
                "currency": str(override.get("currency", "usd")).lower(),
                "per": "request",
            }
        if t == "agreement":
            return {
                "type": "agreement",
                "document_hash": "sha256:bridge-required",
                "document_url": "https://eep.dev/agreements/mcp-tool-usage",
                "document_title": "MCP Tool Agreement",
                "signature_algo": "EdDSA",
            }
        if t == "credential":
            return {
                "type": "credential",
                "credential_type": override.get("credential_type", "BridgeCredential"),
            }

    annotations = tool.get("annotations") or {}
    if annotations.get("readOnlyHint") is True:
        return None
    if annotations.get("destructiveHint") is True:
        return {
            "type": "agreement",
            "document_hash": "sha256:destructive-tool",
            "document_url": "https://eep.dev/agreements/destructive-tools",
            "document_title": "Destructive Tool Acknowledgement",
            "signature_algo": "EdDSA",
        }
    if isinstance(annotations.get("price_usd"), (int, float)):
        return {
            "type": "payment",
            "amount": annotations["price_usd"],
            "currency": "usd",
            "per": "request",
        }
    if isinstance(annotations.get("required_credential"), str):
        return {
            "type": "credential",
            "credential_type": annotations["required_credential"],
        }
    return None


def to_eep_manifest(config: Dict[str, Any], introspection: Dict[str, Any]) -> Dict[str, Any]:
    base_url = str(config["base_url"])
    resources = introspection.get("resources") or []
    mime_types = ["application/json"]
    for res in resources:
        mime = res.get("mimeType")
        if isinstance(mime, str) and mime not in mime_types:
            mime_types.append(mime)

    return {
        "did": config["did"],
        "eep_version": "0.1",
        "layers": {
            "layer1": f"{base_url}/.well-known/eep.json",
            "layer2_sse": f"{base_url}/eep/stream",
            "layer2_webhook": f"{base_url}/eep/subscribe",
            "layer3_ws": f"{base_url.replace('http', 'ws', 1)}/eep/pulse",
        },
        "supported_content_types": mime_types,
        "services_url": f"{base_url}/eep/services",
        "pqc_ready": False,
        "x402_enabled": True,
    }


def to_service_catalog(introspection: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    services: List[Dict[str, Any]] = []
    for tool in introspection.get("tools") or []:
        services.append(
            {
                "id": tool["name"],
                "name": (tool.get("annotations") or {}).get("title", tool["name"]),
                "description": tool.get("description", f"MCP tool {tool['name']}"),
                "category": "mcp",
                "tags": ["bridge", "mcp"],
                "pricing": {"model": "fixed", "amount": 0, "currency": "usd"},
                "availability": {"type": "always"},
                "delivery": "api",
                "status": "active",
                "metadata": {
                    "input_schema": tool.get("inputSchema", {}),
                    "annotations": tool.get("annotations", {}),
                },
            }
        )
    return {"services": services}


def to_gate_config(config: Dict[str, Any], introspection: Dict[str, Any]) -> Dict[str, Any]:
    tiers: Dict[str, Any] = {"public": {"access": ["eep.services.list"], "requirements": []}}
    gated_tools = config.get("gated_tools") or {}
    for tool in introspection.get("tools") or []:
        req = _requirement_from_tool(tool, gated_tools)
        tier_name = f"tool_{tool['name']}"
        tiers[tier_name] = {
            "access": [f"mcp.tools.call.{tool['name']}"],
            "requirements": [req] if req else [],
        }
    return {"version": "0.1", "default_tier": "public", "tiers": tiers}


def _proof_satisfies(requirement: Dict[str, Any], proofs: List[Dict[str, Any]]) -> bool:
    rtype = requirement.get("type")
    for proof in proofs:
        if proof.get("type") != rtype:
            continue
        if rtype == "payment" and any(proof.get(k) for k in ("token", "tx_hash", "x402_payload")):
            return True
        if rtype == "agreement" and isinstance(proof.get("signature"), str) and proof.get("signature"):
            return True
        if rtype == "credential" and isinstance(proof.get("credential"), str) and proof.get("credential"):
            return True
    return False


def evaluate_mcp_call_access(gate_config: Dict[str, Any], tool_name: str, proofs: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not TOOL_NAME_RE.match(tool_name):
        return {"granted": False, "status": 400, "body": {"error": "invalid_tool_name"}}

    tier_key = f"tool_{tool_name}"
    tier = gate_config.get("tiers", {}).get(tier_key)
    if not tier:
        return {"granted": True, "status": 200}

    missing = []
    for requirement in tier.get("requirements", []):
        if not _proof_satisfies(requirement, proofs):
            missing.append({"type": requirement.get("type")})

    if missing:
        return {
            "granted": False,
            "status": 402,
            "body": {
                "error": "access_restricted",
                "resource": f"mcp.tools.call.{tool_name}",
                "current_tier": gate_config.get("default_tier", "public"),
                "required_tier": tier_key,
                "unmet_requirements": missing,
            },
        }
    return {"granted": True, "status": 200}


def run_bridge_server(config: Dict[str, Any], host: str = "0.0.0.0", port: int = 3001) -> None:
    cfg = validate_bridge_config(config)
    introspection = fetch_mcp_introspection(cfg)
    artifacts = build_bridge_artifacts(cfg, introspection)
    known_tools = {t.get("name") for t in introspection.get("tools", []) if isinstance(t.get("name"), str)}
    subscriptions: List[Dict[str, Any]] = []

    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, payload: Dict[str, Any]) -> None:
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _read_json(self) -> Dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            raw = self.rfile.read(length).decode("utf-8").strip()
            if not raw:
                return {}
            return json.loads(raw)

        def do_GET(self) -> None:
            path = self.path.split("?", 1)[0]
            if path == "/.well-known/eep.json":
                self._json(200, artifacts["manifest"])
                return
            if path == "/eep/services":
                self._json(200, artifacts["services"])
                return
            if path == "/eep/gates":
                self._json(200, artifacts["gates"])
                return
            if path == "/eep/stream":
                event = {
                    "specversion": "1.0",
                    "id": f"evt_{len(subscriptions) + 1}",
                    "source": cfg.get("source_did", cfg["did"]),
                    "type": "com.eep.bridge.snapshot",
                    "datacontenttype": "application/json",
                    "data": {"active_subscriptions": len(subscriptions), "tools": len(known_tools)},
                }
                payload = f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            self._json(404, {"error": "not_found"})

        def do_POST(self) -> None:
            try:
                if self.path == "/eep/subscribe":
                    body = self._read_json()
                    delivery_method = "webhook" if body.get("delivery_method") == "webhook" else "sse"
                    entry = {
                        "id": f"sub_{len(subscriptions) + 1}",
                        "source_did": body.get("source_did") or cfg.get("source_did") or cfg["did"],
                        "delivery_method": delivery_method,
                        "callback_url": body.get("callback_url"),
                    }
                    subscriptions.append(entry)
                    self._json(
                        200,
                        {
                            "subscription_id": entry["id"],
                            "status": "pending_verification" if delivery_method == "webhook" else "active",
                            "source_did": entry["source_did"],
                            "delivery_method": delivery_method,
                        },
                    )
                    return

                if self.path == "/mcp/tools/call":
                    body = self._read_json()
                    name = str(body.get("name", ""))
                    if not TOOL_NAME_RE.match(name):
                        self._json(400, {"error": "invalid_tool_name"})
                        return
                    if name not in known_tools:
                        self._json(404, {"error": "unknown_tool"})
                        return
                    proofs = body.get("gate_proofs")
                    if not isinstance(proofs, list):
                        proofs = []
                    decision = evaluate_mcp_call_access(artifacts["gates"], name, proofs)
                    if not decision["granted"]:
                        self._json(decision["status"], decision.get("body", {"error": "access_restricted"}))
                        return
                    result = call_mcp_tool(cfg, name, body.get("arguments") or {})
                    self._json(200, {"ok": True, "result": result})
                    return
                self._json(404, {"error": "not_found"})
            except Exception as exc:  # pragma: no cover - tested via status behavior
                self._json(500, {"error": "bridge_error", "message": str(exc)})

        def log_message(self, _format: str, *_args: object) -> None:
            return

    httpd = HTTPServer((host, port), Handler)
    print(f"EEP MCP bridge listening on {host}:{port}")
    httpd.serve_forever()
