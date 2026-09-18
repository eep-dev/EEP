from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


GateProof = dict[str, Any]


@dataclass(slots=True)
class SubscriptionRecord:
    subscription_id: str
    source_did: str
    delivery_method: str
    callback_url: str | None
    created_at: str
    #: RFC 3339 instant at which the lease elapses (SPECIFICATION.md §10.2).
    #: A subscription past this instant MUST NOT receive deliveries. ``None``
    #: means the publisher granted an unbounded lease.
    expires_at: str | None = None


@dataclass(slots=True)
class CloudEvent:
    event_id: str
    event_type: str
    source: str
    time: str
    data: dict[str, Any]


class AuthAdapter(Protocol):
    async def extract_proofs(self, headers: dict[str, str], query: dict[str, str] | None = None) -> list[GateProof]:
        ...


class EventBusAdapter(Protocol):
    async def publish(self, event: CloudEvent) -> None:
        ...

    async def subscribe(self, pattern: str, handler: Callable[[CloudEvent], None]) -> None:
        ...


class DBAdapter(Protocol):
    async def save_subscription(self, subscription: SubscriptionRecord) -> None:
        ...

    async def get_subscription(self, subscription_id: str) -> SubscriptionRecord | None:
        ...

    async def list_subscriptions(self) -> list[SubscriptionRecord]:
        ...
