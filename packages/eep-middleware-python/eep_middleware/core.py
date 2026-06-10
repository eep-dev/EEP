from __future__ import annotations

import json
import time
from typing import Any, Callable

from eep_gates import ProofVerifier, ProofVerifierRegistry, build_402_response, resolve_access
from eep_validator import SSRFError, validate_ssrf

from eep_middleware.adapters import AuthAdapter, CloudEvent, DBAdapter, EventBusAdapter, SubscriptionRecord
from eep_middleware.db.in_memory import InMemoryDBAdapter
from eep_middleware.event_bus.in_memory import InMemoryEventBusAdapter


class HeaderProofAuthAdapter:
    async def extract_proofs(self, headers: dict[str, str], query: dict[str, str] | None = None) -> list[dict[str, Any]]:
        raw = headers.get("x-eep-proofs")
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if not isinstance(parsed, list):
                return []
            return parsed
        except Exception:
            return []


class EEPServer:
    def __init__(
        self,
        base_url: str,
        did: str,
        gate_config: dict[str, Any] | None = None,
        services: dict[str, Any] | None = None,
        auth_adapter: AuthAdapter | None = None,
        db_adapter: DBAdapter | None = None,
        event_bus_adapter: EventBusAdapter | None = None,
        proof_verifiers: list[ProofVerifier] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.did = did
        self.gate_config = gate_config or {
            "default_tier": "public",
            "tiers": {
                "public": {"requirements": [], "access": ["entity.public.profile"]},
            },
        }
        self.services = services or {"entity_did": did, "services": []}
        self.auth_adapter = auth_adapter or HeaderProofAuthAdapter()
        self.db_adapter = db_adapter or InMemoryDBAdapter()
        self.event_bus_adapter = event_bus_adapter or InMemoryEventBusAdapter()
        # Semantic proof verifiers (e.g. payment settlement, trust lookup). Without a
        # verifier for a requirement type, that requirement stays unmet under strict
        # verification — the server fails closed rather than trusting unverified proofs.
        self.verifier_registry = ProofVerifierRegistry()
        for verifier in proof_verifiers or []:
            self.verifier_registry.register(verifier)

    def manifest_payload(self) -> dict[str, Any]:
        return {
            "did": self.did,
            "eep_version": "0.1",
            "layers": {
                "layer1": f"{self.base_url}/u/u/default",
                "layer2_sse": f"{self.base_url}/eep/stream",
                "layer2_webhook": f"{self.base_url}/eep/subscribe",
                "layer3_ws": f"{self.base_url.replace('http', 'ws', 1)}/eep/pulse",
            },
            "supported_content_types": ["application/json", "text/markdown"],
            "gates_url": f"{self.base_url}/eep/gates",
            "services_url": f"{self.base_url}/eep/services",
            "pqc_ready": False,
            "x402_enabled": False,
        }

    def entity_payload(self, entity_type: str | None = None, entity_id: str | None = None) -> dict[str, Any]:
        resolved_type = entity_type or "u"
        resolved_id = entity_id or "default"
        return {
            "id": resolved_id,
            "type": resolved_type,
            "did": f"{self.did}:{resolved_type}:{resolved_id}",
            "eep": {"version": "0.1", "endpoint": f"{self.base_url}/eep", "supported_delivery": ["webhook", "sse"]},
        }

    async def resolve_gated_resource(self, resource: str | None, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
        target_resource = resource or "entity.public.profile"
        proofs = await self.auth_adapter.extract_proofs(headers, None)
        access = await resolve_access(
            proofs,
            self.gate_config,
            target_resource,
            self.verifier_registry,
            strict_semantic_verification=True,
        )
        if not access.granted:
            payload = await build_402_response(self.gate_config, target_resource, proofs)
            return 402, payload
        return 200, {"resource": target_resource, "tier": access.tier, "data": {"value": "access_granted"}}

    async def create_subscription(self, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        source_did = payload.get("source_did")
        delivery_method = payload.get("delivery_method")
        if not isinstance(source_did, str) or delivery_method not in {"sse", "webhook"}:
            return 400, {"error": "invalid_request", "message": "source_did and delivery_method are required"}

        delivery_url = str(payload["delivery_url"]) if isinstance(payload.get("delivery_url"), str) else None

        # Webhook deliveries are fetched server-side, so the callback URL is an SSRF
        # vector: validate it points at a public address before persisting it. SSE
        # deliveries are client-initiated and need no callback URL.
        if delivery_method == "webhook":
            if not delivery_url:
                return 400, {
                    "error": "invalid_request",
                    "message": "delivery_url is required when delivery_method is webhook",
                }
            try:
                await validate_ssrf(delivery_url)
            except SSRFError as err:
                return 400, {"error": "invalid_request", "message": f"delivery_url is not allowed: {err}"}

        subscription = SubscriptionRecord(
            subscription_id=f"sub_{int(time.time() * 1000)}",
            source_did=source_did,
            delivery_method=str(delivery_method),
            callback_url=delivery_url,
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        await self.db_adapter.save_subscription(subscription)
        await self.event_bus_adapter.publish(
            CloudEvent(
                event_id=f"evt_{int(time.time() * 1000)}",
                event_type="subscription.created",
                source=self.did,
                time=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                data={
                    "subscription_id": subscription.subscription_id,
                    "source_did": subscription.source_did,
                    "delivery_method": subscription.delivery_method,
                },
            )
        )
        return 201, {
            "subscription_id": subscription.subscription_id,
            "source_did": subscription.source_did,
            "delivery_method": subscription.delivery_method,
            "callback_url": subscription.callback_url,
            "created_at": subscription.created_at,
        }

    async def audit_payload(self) -> dict[str, Any]:
        subscriptions = await self.db_adapter.list_subscriptions()
        return {
            "subscriptions_count": len(subscriptions),
            "subscriptions": [
                {
                    "subscription_id": item.subscription_id,
                    "source_did": item.source_did,
                    "delivery_method": item.delivery_method,
                    "callback_url": item.callback_url,
                    "created_at": item.created_at,
                }
                for item in subscriptions
            ],
        }

    async def get_subscription(self, subscription_id: str) -> SubscriptionRecord | None:
        return await self.db_adapter.get_subscription(subscription_id)

    async def subscribe_to_events(self, pattern: str, handler: Callable[[CloudEvent], None]) -> None:
        await self.event_bus_adapter.subscribe(pattern, handler)
