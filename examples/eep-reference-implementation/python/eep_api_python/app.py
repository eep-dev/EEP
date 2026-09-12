"""
EEP Python reference API — parity with `node/src/server.ts` (v0.1 normative rollout).

Debug: set EEP_PUBLIC_BASE_URL for stable manifest/layer URLs (default http://localhost:3200).
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Set

from fastapi import FastAPI, Header, Request, WebSocket
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.websockets import WebSocketDisconnect

from eep_gates import (
    build_402_response,
    delegation_permits_data_request,
    parse_gate_config,
    resolve_access,
    serialize_gate_config,
)

# Fixed document hash for reference agreement gate (demo only) — matches Node reference.
DEMO_AGREEMENT_HASH = (
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

BASE_URL = os.environ.get("EEP_PUBLIC_BASE_URL", "http://localhost:3200")

GATE_CONFIG = parse_gate_config(
    {
        "version": "0.1",
        "default_tier": "public",
        "tiers": {
            "public": {"access": ["eep.services.list", "entity.public.profile"], "requirements": []},
            "premium": {
                "access": ["content.papers.full_text"],
                "requirements": [{"type": "payment", "amount": 1, "currency": "usd", "per": "request"}],
            },
            "premium_bundle": {
                "access": ["content.bundle.report"],
                "requirements": [
                    {
                        "type": "combined",
                        "combine_mode": "all",
                        "recommended_collection_order": ["agreement", "payment"],
                        "requirements": [
                            {"type": "payment", "amount": 1, "currency": "usd", "per": "request"},
                            {
                                "type": "agreement",
                                "document_hash": DEMO_AGREEMENT_HASH,
                                "document_url": "https://example.com/eep-reference/terms",
                            },
                        ],
                    }
                ],
            },
        },
    }
)

EEP_REGISTRY_MANIFEST: Dict[str, Any] = {
    "did": "did:web:registry.eep.dev.ref",
    "registry_name": "EEP Reference Federation Registry",
    "scope": {"geography": ["EU"], "sectors": ["reference"]},
    "conformance_tier_required": "Full",
    "economics": {
        "registration_fee": {"amount": 0, "currency": "USD", "per": "year"},
        "query_quota": {
            "free_requests_per_day": 1000,
            "paid_tier_url": "https://example.com/eep-registry-pricing",
        },
        "staking_or_challenge": {
            "mode": "proof_of_work_challenge",
            "challenge_endpoint": "https://example.com/genesis-challenge",
        },
    },
}

SERVICES: Dict[str, Any] = {
    "entity_did": "did:web:api.eep.dev:u:acme-corp",
    "services": [
        {
            "id": "price_feed",
            "name": "Price Feed",
            "category": "market-data",
            "pricing": {"model": "fixed", "amount": 1, "currency": "usd"},
            "delivery": "api",
        }
    ],
}

graduated_trust: Set[str] = set()

try:  # Optional runtime dependency for compose deployment
    import psycopg
except Exception:  # pragma: no cover
    psycopg = None

try:  # Optional runtime dependency for compose deployment
    from redis import Redis
except Exception:  # pragma: no cover
    Redis = None


class SubscriptionStore:
    def __init__(self) -> None:
        self.memory: List[Dict[str, Any]] = []
        self.db_conn = None
        self.redis = None
        self.pg_ready = False
        self.redis_ready = False

        db_url = os.environ.get("EEP_DATABASE_URL")
        if psycopg is not None and db_url:  # pragma: no cover - integration path
            try:
                self.db_conn = psycopg.connect(db_url, autocommit=True)
                with self.db_conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS eep_subscriptions (
                          subscription_id TEXT PRIMARY KEY,
                          source_did TEXT NOT NULL,
                          delivery_method TEXT NOT NULL,
                          callback_url TEXT,
                          created_at TIMESTAMPTZ NOT NULL
                        )
                        """
                    )
                self.pg_ready = True
            except Exception:
                self.pg_ready = False

        redis_url = os.environ.get("EEP_REDIS_URL")
        if Redis is not None and redis_url:  # pragma: no cover - integration path
            try:
                self.redis = Redis.from_url(redis_url, socket_connect_timeout=1)
                self.redis.ping()
                self.redis_ready = True
            except Exception:
                self.redis_ready = False

    def save(self, sub: Dict[str, Any]) -> None:
        self.memory.append(sub)
        if self.db_conn is not None and self.pg_ready:
            with self.db_conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO eep_subscriptions (subscription_id, source_did, delivery_method, callback_url, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (subscription_id) DO NOTHING
                    """,
                    (
                        sub["subscription_id"],
                        sub["source_did"],
                        sub["delivery_method"],
                        sub.get("callback_url"),
                        sub["created_at"],
                    ),
                )
        if self.redis is not None and self.redis_ready:
            self.redis.publish("eep.subscription.created", json.dumps(sub))

    def count(self) -> int:
        if self.db_conn is not None and self.pg_ready:
            with self.db_conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM eep_subscriptions")
                row = cur.fetchone()
                return int(row[0]) if row else 0
        return len(self.memory)

    def status(self) -> Dict[str, bool]:
        return {"postgres": self.pg_ready, "redis": self.redis_ready}


SUBSCRIPTIONS = SubscriptionStore()


class TrustStateMiddleware(BaseHTTPMiddleware):
    """Emit X-EEP-Trust-State for agent DIDs (cold_start vs standard)."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        agent = request.headers.get("eep-agent-did") or request.headers.get("EEP-Agent-DID")
        if agent and agent.startswith("did:"):
            state = "standard" if agent in graduated_trust else "cold_start"
            response.headers["X-EEP-Trust-State"] = state
        return response


app = FastAPI(title="EEP Python Reference", version="0.1.0")
app.add_middleware(TrustStateMiddleware)


def _base_url_for_request(request: Request) -> str:
    """Prefer forwarded/proto headers when behind a proxy; else EEP_PUBLIC_BASE_URL."""
    if os.environ.get("EEP_PUBLIC_BASE_URL"):
        return str(os.environ["EEP_PUBLIC_BASE_URL"]).rstrip("/")
    host = request.headers.get("host")
    if host:
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        return f"{scheme}://{host}".rstrip("/")
    return BASE_URL.rstrip("/")


@app.get("/.well-known/eep-registry.json")
def well_known_registry(request: Request) -> Dict[str, Any]:
    base = _base_url_for_request(request)
    return {
        **EEP_REGISTRY_MANIFEST,
        "federation_credential_url": f"{base}/.well-known/eep-federation-credential.json",
    }


@app.get("/.well-known/eep.json")
def well_known(request: Request) -> Dict[str, Any]:
    base = _base_url_for_request(request)
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
    return {
        "did": "did:web:api.eep.dev:u:acme-corp",
        "eep_version": "0.1",
        "layers": {
            "layer1": f"{base}/u/u/acme-corp",
            "layer2_sse": f"{base}/eep/stream",
            "layer2_webhook": f"{base}/eep/subscribe",
            "layer3_ws": f"{ws_base}/eep/pulse",
        },
        "supported_content_types": ["application/json", "text/markdown"],
        "pqc_ready": False,
        "x402_enabled": True,
        "gates_url": f"{base}/eep/gates",
        "services_url": f"{base}/eep/services",
    }


@app.post("/eep/trust/graduate")
def trust_graduate(payload: Dict[str, Any]) -> JSONResponse:
    did = payload.get("agent_did") if isinstance(payload.get("agent_did"), str) else ""
    if not str(did).startswith("did:"):
        return JSONResponse({"error": "invalid_agent_did"}, status_code=400)
    graduated_trust.add(str(did))
    return JSONResponse({"ok": True, "agent_did": did, "trust_state": "standard"})


@app.get("/eep/trust-status")
def trust_status(agent_did: str | None = None) -> JSONResponse:
    did = agent_did or ""
    if not did.startswith("did:"):
        return JSONResponse({"error": "missing_or_invalid_agent_did"}, status_code=400)
    return JSONResponse(
        {"agent_did": did, "trust_state": "standard" if did in graduated_trust else "cold_start"}
    )


@app.post("/eep/delegation/verify")
async def delegation_verify(payload: Dict[str, Any]) -> JSONResponse:
    sub = payload.get("credential_subject")
    dr = payload.get("data_request_requirement")
    if not isinstance(sub, dict) or not isinstance(dr, dict) or dr.get("type") != "data_request":
        return JSONResponse(
            {"error": "credential_subject_and_data_request_requirement_required"},
            status_code=400,
        )
    result = delegation_permits_data_request(sub, dr)
    body: Dict[str, Any] = {"valid": result.valid, "errors": list(result.errors)}
    return JSONResponse(body, status_code=200 if result.valid else 403)


@app.get("/healthz")
def healthz() -> Dict[str, Any]:
    status = SUBSCRIPTIONS.status()
    return {"ok": True, "runtime": "python", "postgres": status["postgres"], "redis": status["redis"]}


@app.get("/u/")
def resolve_entity_fallback(request: Request) -> JSONResponse:
    """Match Node behavior for GET /u/ → default entity parts."""
    return _resolve_entity("u", "acme-corp", request)


@app.get("/u/{entity_type}/{entity_id}")
def resolve_entity(entity_type: str, entity_id: str, request: Request) -> JSONResponse:
    return _resolve_entity(entity_type, entity_id, request)


def _resolve_entity(entity_type: str, entity_id: str, request: Request) -> JSONResponse:
    base = _base_url_for_request(request)
    body = {
        "id": entity_id,
        "type": entity_type,
        "did": f"did:web:api.eep.dev:{entity_type}:{entity_id}",
        "eep": {"version": "0.1", "endpoint": f"{base}/eep", "supported_delivery": ["webhook", "sse"]},
    }
    headers = {
        "EEP-Version": "0.1",
        "EEP-Entity-DID": f"did:web:api.eep.dev:{entity_type}:{entity_id}",
        "Link": f'<{base}/eep/subscribe>; rel="subscribe", <{base}/eep/stream?source={entity_id}>; rel="monitor"',
    }
    return JSONResponse(body, headers=headers)


@app.get("/eep/services")
def list_services() -> Dict[str, Any]:
    return SERVICES


@app.get("/eep/gates")
def gates() -> Dict[str, Any]:
    return serialize_gate_config(GATE_CONFIG)


@app.post("/eep/subscribe", status_code=201)
def subscribe(payload: Dict[str, Any]) -> Dict[str, Any]:
    method = "webhook" if payload.get("delivery_method") == "webhook" else "sse"
    subscription_id = f"sub_ref_{int(time.time() * 1000)}"
    # The wire field is `delivery_url` — that is what
    # schemas/v0.1/subscription.request.json defines and what every
    # conformant subscriber sends. `callback_url` is this stack's own
    # internal column name and was never part of the request body; reading
    # it here silently discarded the delivery target.
    delivery_url = payload.get("delivery_url")
    if not isinstance(delivery_url, str):
        # Deprecated alias, accepted for older demos.
        delivery_url = payload.get("callback_url")
    if not isinstance(delivery_url, str):
        delivery_url = None
    entry = {
        "subscription_id": subscription_id,
        "source_did": payload.get("source_did", "did:web:api.eep.dev:u:acme-corp"),
        "delivery_method": method,
        "callback_url": delivery_url,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    SUBSCRIPTIONS.save(entry)
    return {
        "subscription_id": subscription_id,
        "status": "pending_verification" if method == "webhook" else "active",
        "source_did": entry["source_did"],
        # Echo the stored target so a subscriber (and the conformance
        # suite) can confirm it was actually recorded.
        "delivery_url": entry["callback_url"],
        "created_at": entry["created_at"],
    }


@app.get("/eep/stream")
def stream() -> StreamingResponse:
    event = {
        "specversion": "1.0",
        "id": f"evt_{int(time.time())}",
        "source": "did:web:api.eep.dev:u:acme-corp",
        "type": "com.eep.entity.updated",
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "datacontenttype": "application/json",
        "data": {"field": "status", "value": "ok", "active_subscriptions": SUBSCRIPTIONS.count()},
    }

    def gen():
        yield "event: com.eep.entity.updated\n"
        yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/eep/content/{entity_did}/{resource:path}")
async def content(
    entity_did: str,
    resource: str,
    x_eep_gate_proofs: str | None = Header(default=None),
) -> JSONResponse:
    del entity_did  # path parity with Node; not used for authorization in reference
    proofs: List[Dict[str, Any]] = json.loads(x_eep_gate_proofs) if x_eep_gate_proofs else []
    res_id = resource or "content.papers.full_text"
    access = await resolve_access(
        proofs,
        GATE_CONFIG,
        res_id,
        None,
        strict_semantic_verification=False,
    )
    if not access.granted:
        body = await build_402_response(GATE_CONFIG, res_id, proofs)
        return JSONResponse(body, status_code=402)
    if res_id == "content.bundle.report":
        return JSONResponse({"content": "bundle report unlocked", "resource": res_id, "combined_gate": True})
    return JSONResponse({"content": "full text unlocked"})


@app.websocket("/eep/pulse")
async def pulse(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json({"v": 1, "type": "system", "action": "connected", "seq": 1})
    while True:
        try:
            payload = await ws.receive_json()
        except WebSocketDisconnect:
            break
        if payload.get("action") == "subscribe":
            await ws.send_json({"v": 1, "type": "system", "action": "subscribed", "seq": 2, "data": {"ok": True}})
            continue
        if payload.get("type") == "commerce" and payload.get("action") == "commerce.dispute.open":
            seq = int(payload.get("seq") or 0)
            data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
            neg_id = data.get("negotiation_id") or "neg_demo"
            await ws.send_json(
                {
                    "v": 1,
                    "type": "commerce",
                    "action": "commerce.dispute.resolved",
                    "seq": seq + 1,
                    "data": {"negotiation_id": neg_id, "outcome": "dismissed"},
                }
            )
