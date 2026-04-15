from __future__ import annotations

from typing import Any

from eep_middleware.core import EEPServer


def create_eep_blueprint(server: EEPServer) -> dict[str, Any]:
    return {
        "name": "eep",
        "routes": [
            {"method": "GET", "path": "/.well-known/eep.json"},
            {"method": "GET", "path": "/u/<entity_type>/<entity_id>"},
            {"method": "GET", "path": "/eep/gates"},
            {"method": "GET", "path": "/eep/services"},
            {"method": "GET", "path": "/healthz"},
            {"method": "GET", "path": "/eep/stream"},
            {"method": "GET", "path": "/eep/content/<path:resource_path>"},
            {"method": "POST", "path": "/eep/subscribe"},
            {"method": "GET", "path": "/eep/audit-log"},
            {"method": "GET", "path": "/eep/pulse"},
        ],
        "did": server.did,
    }
