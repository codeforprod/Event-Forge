from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
from ..models import OutboxMessage


@dataclass
class PublishOptions:
    """Options for publishing a message."""

    exchange: Optional[str] = None
    """Exchange name (for RabbitMQ)."""

    routing_key: Optional[str] = None
    """Routing key."""

    topic: Optional[str] = None
    """Topic name (for Kafka, etc.)."""

    priority: Optional[int] = None
    """Message priority (0-9, higher is more important)."""

    expiration: Optional[int] = None
    """Message TTL in milliseconds."""

    headers: dict[str, Any] = field(default_factory=dict)
    """Custom headers."""


class IMessagePublisher(ABC):
    """Message Publisher Interface.

    Defines operations for publishing messages to external systems.
    """

    @abstractmethod
    async def publish(self, message: OutboxMessage, options: Optional[PublishOptions] = None) -> None:
        """Publish a message to the message broker."""
        pass

    async def connect(self) -> None:
        """Connect to the message broker. Called once during application startup."""
        pass

    async def disconnect(self) -> None:
        """Disconnect from the message broker. Called during graceful shutdown."""
        pass

    def is_connected(self) -> bool:
        """Check if publisher is connected."""
        return False
