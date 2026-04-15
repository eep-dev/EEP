import pytest

from eep_middleware.adapters import CloudEvent
from eep_middleware.event_bus.in_memory import InMemoryEventBusAdapter
from eep_middleware.event_bus.redis_adapter import RedisEventBusAdapter


@pytest.mark.asyncio
async def test_in_memory_event_bus_publish_and_match_patterns() -> None:
    bus = InMemoryEventBusAdapter()
    received: list[str] = []

    await bus.subscribe("subscription.*", lambda event: received.append(event.event_type))
    await bus.subscribe("exact.event", lambda event: received.append(f"exact:{event.event_type}"))
    await bus.subscribe("*", lambda event: received.append(f"all:{event.event_type}"))

    await bus.publish(
        CloudEvent(
            event_id="1",
            event_type="subscription.created",
            source="did:web:example",
            time="2026-01-01T00:00:00Z",
            data={},
        )
    )
    await bus.publish(
        CloudEvent(
            event_id="2",
            event_type="unmatched.event",
            source="did:web:example",
            time="2026-01-01T00:00:00Z",
            data={},
        )
    )
    await bus.publish(
        CloudEvent(
            event_id="3",
            event_type="exact.event",
            source="did:web:example",
            time="2026-01-01T00:00:00Z",
            data={},
        )
    )

    assert "subscription.created" in received
    assert "all:subscription.created" in received
    assert "exact:exact.event" in received
    assert len(bus.get_published_events()) == 3


@pytest.mark.asyncio
async def test_redis_event_bus_adapter_publish_and_subscribe() -> None:
    published: list[tuple[str, str]] = []
    callback_holder = {"cb": None}

    class Client:
        async def publish(self, channel: str, payload: str) -> int:
            published.append((channel, payload))
            return 1

        async def subscribe(self, channel: str, callback):
            callback_holder["cb"] = callback

    adapter = RedisEventBusAdapter(Client(), prefix="eep.")
    received: list[str] = []
    await adapter.subscribe("subscription.created", lambda event: received.append(event.event_type))
    await adapter.publish(
        CloudEvent(
            event_id="evt_1",
            event_type="subscription.created",
            source="did:web:example",
            time="2026-01-01T00:00:00Z",
            data={},
        )
    )

    callback_holder["cb"]('{"event_id":"evt_1","event_type":"subscription.created","source":"did:web:example","time":"2026","data":{}}')
    callback_holder["cb"]("not-json")

    assert published[0][0] == "eep.subscription.created"
    assert received == ["subscription.created"]
