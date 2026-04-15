from __future__ import annotations

from typing import Callable

from eep_middleware.adapters import CloudEvent


class InMemoryEventBusAdapter:
    def __init__(self) -> None:
        self._events: list[CloudEvent] = []
        self._subscribers: list[tuple[str, Callable[[CloudEvent], None]]] = []

    async def publish(self, event: CloudEvent) -> None:
        self._events.append(event)
        for pattern, handler in self._subscribers:
            if self._matches(pattern, event.event_type):
                handler(event)

    async def subscribe(self, pattern: str, handler: Callable[[CloudEvent], None]) -> None:
        self._subscribers.append((pattern, handler))

    def get_published_events(self) -> list[CloudEvent]:
        return list(self._events)

    @staticmethod
    def _matches(pattern: str, event_type: str) -> bool:
        if pattern == "*":
            return True
        if "*" not in pattern:
            return pattern == event_type
        prefix = pattern.split("*")[0]
        return event_type.startswith(prefix)
