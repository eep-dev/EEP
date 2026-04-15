from __future__ import annotations

from eep_middleware.adapters import SubscriptionRecord


class InMemoryDBAdapter:
    def __init__(self) -> None:
        self._items: dict[str, SubscriptionRecord] = {}

    async def save_subscription(self, subscription: SubscriptionRecord) -> None:
        self._items[subscription.subscription_id] = subscription

    async def get_subscription(self, subscription_id: str) -> SubscriptionRecord | None:
        return self._items.get(subscription_id)

    async def list_subscriptions(self) -> list[SubscriptionRecord]:
        return list(self._items.values())
