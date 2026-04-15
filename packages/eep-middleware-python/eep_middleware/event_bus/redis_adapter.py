from __future__ import annotations

import json
from typing import Any, Callable, Protocol

from eep_middleware.adapters import CloudEvent


class RedisClientLike(Protocol):
    async def publish(self, channel: str, payload: str) -> int:
        ...

    async def subscribe(self, channel: str, callback: Callable[[str], None]) -> None:
        ...


class RedisEventBusAdapter:
    def __init__(self, client: RedisClientLike, prefix: str = "eep.") -> None:
        self._client = client
        self._prefix = prefix

    async def publish(self, event: CloudEvent) -> None:
        payload = json.dumps(
            {
                "event_id": event.event_id,
                "event_type": event.event_type,
                "source": event.source,
                "time": event.time,
                "data": event.data,
            }
        )
        await self._client.publish(f"{self._prefix}{event.event_type}", payload)

    async def subscribe(self, pattern: str, handler: Callable[[CloudEvent], None]) -> None:
        def _callback(message: str) -> None:
            try:
                raw: dict[str, Any] = json.loads(message)
            except Exception:
                return
            event = CloudEvent(
                event_id=str(raw.get("event_id", "")),
                event_type=str(raw.get("event_type", "")),
                source=str(raw.get("source", "")),
                time=str(raw.get("time", "")),
                data=raw.get("data", {}) if isinstance(raw.get("data", {}), dict) else {},
            )
            handler(event)

        await self._client.subscribe(f"{self._prefix}{pattern}", _callback)
