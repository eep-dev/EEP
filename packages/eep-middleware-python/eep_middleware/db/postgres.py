from __future__ import annotations

from typing import Protocol

from eep_middleware.adapters import SubscriptionRecord


class SQLClientLike(Protocol):
    async def execute(self, query: str, params: tuple[object, ...] | None = None) -> list[dict[str, object]] | None:
        ...


class PostgresDBAdapter:
    def __init__(self, client: SQLClientLike, table_name: str = "eep_subscriptions") -> None:
        self._client = client
        self._table_name = table_name

    async def save_subscription(self, subscription: SubscriptionRecord) -> None:
        await self._client.execute(
            f"INSERT INTO {self._table_name} (subscription_id, source_did, delivery_method, callback_url, created_at) VALUES ($1,$2,$3,$4,$5)",
            (
                subscription.subscription_id,
                subscription.source_did,
                subscription.delivery_method,
                subscription.callback_url,
                subscription.created_at,
            ),
        )

    async def get_subscription(self, subscription_id: str) -> SubscriptionRecord | None:
        rows = await self._client.execute(
            f"SELECT subscription_id, source_did, delivery_method, callback_url, created_at FROM {self._table_name} WHERE subscription_id = $1",
            (subscription_id,),
        )
        if not rows:
            return None
        row = rows[0]
        return SubscriptionRecord(
            subscription_id=str(row["subscription_id"]),
            source_did=str(row["source_did"]),
            delivery_method=str(row["delivery_method"]),
            callback_url=str(row["callback_url"]) if row.get("callback_url") else None,
            created_at=str(row["created_at"]),
        )

    async def list_subscriptions(self) -> list[SubscriptionRecord]:
        rows = await self._client.execute(
            f"SELECT subscription_id, source_did, delivery_method, callback_url, created_at FROM {self._table_name}"
        )
        if not rows:
            return []
        return [
            SubscriptionRecord(
                subscription_id=str(row["subscription_id"]),
                source_did=str(row["source_did"]),
                delivery_method=str(row["delivery_method"]),
                callback_url=str(row["callback_url"]) if row.get("callback_url") else None,
                created_at=str(row["created_at"]),
            )
            for row in rows
        ]
