from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from eep_middleware.core import EEPServer


def create_eep_router(server: EEPServer) -> APIRouter:
    router = APIRouter()

    @router.get("/.well-known/eep.json")
    async def get_manifest() -> JSONResponse:
        return JSONResponse(server.manifest_payload())

    @router.get("/u/{entity_type}/{entity_id}")
    async def get_entity(entity_type: str, entity_id: str) -> JSONResponse:
        payload = server.entity_payload(entity_type, entity_id)
        response = JSONResponse(payload)
        response.headers["EEP-Version"] = "0.1"
        response.headers["EEP-Entity-DID"] = payload["did"]
        response.headers["Link"] = f"<{server.base_url}/eep/subscribe>; rel=\"subscribe\""
        return response

    @router.get("/eep/gates")
    async def get_gates() -> JSONResponse:
        return JSONResponse(server.gate_config)

    @router.get("/eep/services")
    async def get_services() -> JSONResponse:
        return JSONResponse(server.services)

    @router.get("/healthz")
    async def health() -> JSONResponse:
        return JSONResponse({"ok": True})

    @router.get("/eep/stream")
    async def stream() -> StreamingResponse:
        async def generator():
            yield "event: eep.connected\ndata: {}\n\n"

        return StreamingResponse(generator(), media_type="text/event-stream")

    @router.get("/eep/content/{resource_path:path}")
    async def gated_content(resource_path: str, request: Request) -> JSONResponse:
        status, payload = await server.resolve_gated_resource(resource_path, dict(request.headers))
        return JSONResponse(payload, status_code=status)

    @router.post("/eep/subscribe")
    async def subscribe(request: Request) -> JSONResponse:
        payload = await request.json()
        status, body = await server.create_subscription(payload)
        return JSONResponse(body, status_code=status)

    @router.get("/eep/audit-log")
    async def audit_log() -> JSONResponse:
        return JSONResponse(await server.audit_payload())

    @router.get("/eep/pulse")
    async def pulse_upgrade_required() -> JSONResponse:
        return JSONResponse(
            {"error": "upgrade_required", "message": "Use a WebSocket upgrade request for /eep/pulse"},
            status_code=426,
        )

    return router
