from __future__ import annotations

import argparse
import json

from .bridge import (
    build_bridge_artifacts,
    fetch_mcp_introspection,
    load_bridge_config,
    run_bridge_server,
)


def main() -> None:
    parser = argparse.ArgumentParser(prog="eep-mcp-bridge")
    parser.add_argument("command", choices=["validate-config", "export-manifest", "dry-run", "start"])
    parser.add_argument("--config", default="./bridge.config.json")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()

    cfg = load_bridge_config(args.config)

    if args.command == "validate-config":
        print(json.dumps({"valid": True, "did": cfg["did"]}, indent=2))
        return

    if args.command in {"export-manifest", "dry-run"}:
        introspection = fetch_mcp_introspection(cfg)
        artifacts = build_bridge_artifacts(cfg, introspection)
        print(json.dumps(artifacts, indent=2))
        return

    if args.command == "start":
        run_bridge_server(cfg, host=args.host, port=args.port)
