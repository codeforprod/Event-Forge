import asyncio
import logging
from enum import Enum
from collections import defaultdict
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


class OutboxEvents(str, Enum):
    MESSAGE_CREATED = "outbox:message:created"
    MESSAGE_PUBLISHED = "outbox:message:published"
    MESSAGE_FAILED = "outbox:message:failed"
    POLLING_STARTED = "outbox:polling:started"
    POLLING_STOPPED = "outbox:polling:stopped"


class InboxEvents(str, Enum):
    MESSAGE_RECEIVED = "inbox:message:received"
    MESSAGE_DUPLICATE = "inbox:message:duplicate"
    MESSAGE_PROCESSED = "inbox:message:processed"
    MESSAGE_FAILED = "inbox:message:failed"
    RETRY_POLLING_STARTED = "inbox:retry:polling:started"
    RETRY_POLLING_STOPPED = "inbox:retry:polling:stopped"


EventListener = Callable[..., Any]


class SimpleEventEmitter:
    """Async-compatible event emitter, analogous to Node.js EventEmitter."""

    def __init__(self) -> None:
        self._listeners: dict[str, list[EventListener]] = defaultdict(list)

    def on(self, event: str, listener: EventListener) -> None:
        """Register a listener for an event."""
        self._listeners[event].append(listener)

    def off(self, event: str, listener: EventListener) -> None:
        """Remove a listener for an event."""
        listeners = self._listeners.get(event)
        if listeners and listener in listeners:
            listeners.remove(listener)
            if not listeners:
                del self._listeners[event]

    def emit(self, event: str, *args: Any, **kwargs: Any) -> None:
        """Emit an event, calling all registered listeners.

        If a listener is a coroutine function, it is scheduled as a task.
        Synchronous listeners are called directly.
        """
        for listener in self._listeners.get(event, []):
            try:
                if asyncio.iscoroutinefunction(listener):
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(listener(*args, **kwargs))
                    except RuntimeError:
                        pass  # No running loop — skip async listener
                else:
                    listener(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in event listener for '{event}': {e}", exc_info=True)

    def remove_all_listeners(self, event: str | None = None) -> None:
        """Remove all listeners for an event, or all events if none specified."""
        if event is None:
            self._listeners.clear()
        elif event in self._listeners:
            del self._listeners[event]
