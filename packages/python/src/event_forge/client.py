import logging
from typing import Any, Optional

from .config import OutboxConfig
from .models import CreateOutboxMessageDto, OutboxMessage
from .publishers.interfaces import IMessagePublisher
from .repositories.interfaces import IOutboxRepository
from .services.outbox_service import OutboxService

logger = logging.getLogger(__name__)


class EventForgeAgentClient:
    """Lightweight fire-and-forget facade for EventForge.

    Designed for Python services that need to:
    1. Create outbox messages within a transaction
    2. Publish messages to RabbitMQ via the outbox pattern
    3. Manage the outbox polling lifecycle

    Usage:
        client = EventForgeAgentClient(
            repository=outbox_repo,
            publisher=aio_pika_publisher,
        )
        await client.start()

        # Fire-and-forget within a transaction
        await client.fire(
            aggregate_type="Call",
            aggregate_id="call-123",
            event_type="call.completed",
            payload={"duration": 120, "status": "success"},
        )

        # Or within an explicit transaction
        async def tx_operation(session):
            # ... business logic ...
            await client.fire(
                aggregate_type="Call",
                aggregate_id="call-123",
                event_type="call.completed",
                payload={"result": "ok"},
                transaction_context=session,
            )
        await client.with_transaction(tx_operation)

        await client.stop()
    """

    def __init__(
        self,
        repository: IOutboxRepository,
        publisher: IMessagePublisher,
        config: Optional[OutboxConfig] = None,
    ) -> None:
        self._outbox_service = OutboxService(
            repository=repository,
            publisher=publisher,
            config=config,
        )

    @property
    def outbox_service(self) -> OutboxService:
        """Access underlying outbox service for advanced operations (events, etc.)."""
        return self._outbox_service

    async def start(self) -> None:
        """Connect publisher and start outbox processor."""
        await self._outbox_service.publisher.connect()
        self._outbox_service.start_processor()
        logger.info("EventForgeAgentClient started")

    async def stop(self) -> None:
        """Stop processor and disconnect publisher."""
        self._outbox_service.stop_processor()
        await self._outbox_service.publisher.disconnect()
        logger.info("EventForgeAgentClient stopped")

    async def fire(
        self,
        aggregate_type: str,
        aggregate_id: str,
        event_type: str,
        payload: dict[str, Any],
        metadata: Optional[dict[str, Any]] = None,
        transaction_context: Any = None,
    ) -> OutboxMessage:
        """Fire-and-forget: create an outbox message for async publishing.

        The message is persisted to the database and will be published
        to RabbitMQ by the outbox polling mechanism.

        Args:
            aggregate_type: Type of the aggregate (e.g., "Call", "User")
            aggregate_id: ID of the aggregate instance
            event_type: Event type (e.g., "call.completed")
            payload: Event payload data
            metadata: Optional metadata
            transaction_context: Optional SQLAlchemy session for transactional writes
        """
        dto = CreateOutboxMessageDto(
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            event_type=event_type,
            payload=payload,
            metadata=metadata,
        )
        return await self._outbox_service.create_message(dto, transaction_context)

    async def with_transaction(self, operation: Any) -> Any:
        """Execute operation within a transaction context."""
        return await self._outbox_service.with_transaction(operation)
