import pytest

from eep_middleware.adapters import SubscriptionRecord
from eep_middleware.db.in_memory import InMemoryDBAdapter
from eep_middleware.db.postgres import PostgresDBAdapter


@pytest.mark.asyncio
async def test_in_memory_db_adapter_roundtrip() -> None:
    db = InMemoryDBAdapter()
    row = SubscriptionRecord(
        subscription_id="sub_1",
        source_did="did:web:agent.example",
        delivery_method="webhook",
        callback_url=None,
        created_at="2026-01-01T00:00:00Z",
    )
    await db.save_subscription(row)
    assert await db.get_subscription("sub_1") == row
    assert await db.get_subscription("missing") is None
    assert await db.list_subscriptions() == [row]


@pytest.mark.asyncio
async def test_postgres_db_adapter_queries_and_maps_results() -> None:
    calls: list[tuple[str, tuple[object, ...] | None]] = []

    class Client:
        async def execute(self, query: str, params: tuple[object, ...] | None = None):
            calls.append((query, params))
            if "WHERE" in query:
                return [
                    {
                        "subscription_id": "sub_1",
                        "source_did": "did:web:agent.example",
                        "delivery_method": "sse",
                        "callback_url": "https://hook.example",
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ]
            if "FROM eep_subscriptions" in query:
                return [
                    {
                        "subscription_id": "sub_1",
                        "source_did": "did:web:agent.example",
                        "delivery_method": "sse",
                        "callback_url": None,
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ]
            return None

    db = PostgresDBAdapter(Client())
    await db.save_subscription(
        SubscriptionRecord(
            subscription_id="sub_1",
            source_did="did:web:agent.example",
            delivery_method="sse",
            callback_url=None,
            created_at="2026-01-01T00:00:00Z",
        )
    )
    loaded = await db.get_subscription("sub_1")
    listed = await db.list_subscriptions()
    assert loaded is not None and loaded.callback_url == "https://hook.example"
    assert listed[0].callback_url is None
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_postgres_db_adapter_handles_empty_rows() -> None:
    class Client:
        async def execute(self, query: str, params: tuple[object, ...] | None = None):
            if "WHERE" in query:
                return None
            return []

    db = PostgresDBAdapter(Client())
    assert await db.get_subscription("missing") is None
    assert await db.list_subscriptions() == []
