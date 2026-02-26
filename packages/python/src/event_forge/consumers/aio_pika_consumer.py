import json
import logging
from typing import Optional

import aio_pika
from aio_pika.abc import (
    AbstractIncomingMessage,
    AbstractRobustConnection,
    AbstractChannel,
    AbstractQueue,
)

from ..errors import DuplicateMessageError, ProcessingError
from ..models import CreateInboxMessageDto
from ..services.inbox_service import InboxService

logger = logging.getLogger(__name__)


class AioPikaConsumer:
    """RabbitMQ consumer using aio-pika with inbox recording.

    Consumes messages from a RabbitMQ queue, records them in the inbox
    for deduplication, and dispatches to registered handlers via InboxService.

    Wire format compatibility with Node.js GolevelupPublisher:
    - Body: camelCase JSON with {id, aggregateType, aggregateId, eventType, payload, metadata, createdAt}
    - AMQP headers: x-aggregate-type, x-aggregate-id, x-event-type
    - messageId from AMQP properties or body.id
    """

    def __init__(
        self,
        url: str,
        inbox_service: InboxService,
        queue_name: str,
        exchange_name: str | None = None,
        routing_keys: list[str] | None = None,
        prefetch_count: int = 10,
        source_name: str = "rabbitmq",
    ) -> None:
        self._url = url
        self._inbox_service = inbox_service
        self._queue_name = queue_name
        self._exchange_name = exchange_name
        self._routing_keys = routing_keys or ["#"]
        self._prefetch_count = prefetch_count
        self._source_name = source_name
        self._connection: AbstractRobustConnection | None = None
        self._channel: AbstractChannel | None = None
        self._queue: AbstractQueue | None = None

    async def start(self) -> None:
        """Connect to RabbitMQ and start consuming messages."""
        self._connection = await aio_pika.connect_robust(self._url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=self._prefetch_count)

        # Declare queue
        self._queue = await self._channel.declare_queue(
            self._queue_name, durable=True
        )

        # Bind to exchange if specified
        if self._exchange_name:
            exchange = await self._channel.declare_exchange(
                self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
            )
            for key in self._routing_keys:
                await self._queue.bind(exchange, routing_key=key)

        # Start consuming
        await self._queue.consume(self._on_message)
        logger.info(
            f"Consumer started on queue '{self._queue_name}' "
            f"(exchange='{self._exchange_name}', keys={self._routing_keys})"
        )

    async def stop(self) -> None:
        """Stop consuming and disconnect."""
        if self._channel and not self._channel.is_closed:
            await self._channel.close()
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
        self._queue = None
        self._channel = None
        self._connection = None
        logger.info("Consumer stopped")

    async def _on_message(self, message: AbstractIncomingMessage) -> None:
        """Handle incoming AMQP message — record in inbox and process.

        Messages are acked on success or when the error is permanent
        (duplicate, processing error, max retries exceeded).
        Messages are requeued only on transient errors.
        """
        try:
            # Parse body (camelCase JSON from Node.js publisher)
            body = json.loads(message.body.decode("utf-8"))

            # Extract messageId: prefer AMQP property, fallback to body.id
            message_id = message.message_id or body.get("id", "")
            if not message_id:
                logger.warning("Message without messageId, acking to avoid infinite requeue")
                await message.ack()
                return

            # Extract event_type: prefer AMQP header, fallback to body
            headers = message.headers or {}
            event_type = (
                headers.get("x-event-type")
                or body.get("eventType", "")
            )

            # Build DTO from the wire format
            dto = CreateInboxMessageDto(
                message_id=str(message_id),
                source=self._source_name,
                event_type=str(event_type),
                payload=body.get("payload", body),
            )

            await self._inbox_service.receive_message(dto)
            await message.ack()
            logger.debug(f"Processed message {message_id}")

        except DuplicateMessageError as e:
            # Duplicate — ack to prevent infinite redelivery
            logger.debug(f"Duplicate message {e.message_id} from {e.source}, ack")
            await message.ack()

        except ProcessingError as e:
            # Permanent processing error — ack (already recorded in inbox as permanently_failed)
            logger.error(f"Permanent processing error: {e}")
            await message.ack()

        except RuntimeError:
            # InboxService raises RuntimeError for retryable failures (already recorded in DB)
            # Ack because retry is handled by inbox retry polling, not AMQP redelivery
            await message.ack()

        except Exception as e:
            # Unexpected error — nack with requeue for transient failures
            logger.error(f"Unexpected error processing message: {e}", exc_info=True)
            await message.nack(requeue=True)
