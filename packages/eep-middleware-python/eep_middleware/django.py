from __future__ import annotations

from typing import Any

from eep_middleware.core import EEPServer


def get_eep_urlpatterns(server: EEPServer) -> list[dict[str, Any]]:
    return [
        {"path": "/.well-known/eep.json", "name": "eep_manifest"},
        {"path": "/u/<str:entity_type>/<str:entity_id>", "name": "eep_entity"},
        {"path": "/eep/gates", "name": "eep_gates"},
        {"path": "/eep/services", "name": "eep_services"},
        {"path": "/healthz", "name": "eep_health"},
        {"path": "/eep/stream", "name": "eep_stream"},
        {"path": "/eep/content/<path:resource_path>", "name": "eep_content"},
        {"path": "/eep/subscribe", "name": "eep_subscribe"},
        {"path": "/eep/audit-log", "name": "eep_audit_log"},
        {"path": "/eep/pulse", "name": "eep_pulse"},
        {"publisher_did": server.did},
    ]
