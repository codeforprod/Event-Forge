import json
import logging
from datetime import timezone
from typing import Any, Optional

import aio_pika
from aio_pika import DeliveryMode, Message
from aio_pika.abc import AbstractRobustConnection, AbstractChannel

from ..models import OutboxMessage
from .interfaces import IMessagePublisher, PublishOptions

logger = logging.getLogger(__name__)


class AioPikaPublisher(IMessagePublisher):
    """RabbitMQ publisher using aio-pika with connect_robust for auto-reconnect.

    Wire format is compatible with the Node.js GolevelupPublisher:
    - Body: camelCase JSON (id, aggregateType, aggregateId, eventType, payload, metadata, createdAt)
    - AMQP headers: x-aggregate-type, x-aggregate-id, x-event-type
    - Properties: persistent delivery, application/json, messageId, timestamp (unix ms)
    - Routing key: {aggregateType}.{eventType}
    """

    def __init__(self, url: str, exchange_name: str) -> None:
        self._url = url
        self._exchange_name = exchange_name
        self._connection: Optional[AbstractRobustConnection] = None
        self._channel: Optional[AbstractChannel] = None
        self._exchange: Optional[aio_pika.abc.AbstractExchange] = None

    async def connect(self) -> None:
        """Establish connection to RabbitMQ with auto-reconnect."""
        self._connection = await aio_pika.connect_robust(self._url)
        self._channel = await self._connection.channel()
        self._exchange = await self._channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        logger.info(f"Connected to RabbitMQ exchange '{self._exchange_name}'")

    async def disconnect(self) -> None:
        """Close connection gracefully."""
        if self._channel and not self._channel.is_closed:
            await self._channel.close()
        if self._connection and not self._connection.is_closed:
            await self._connection.close()
        self._exchange = None
        self._channel = None
        self._connection = None
        logger.info("Disconnected from RabbitMQ")

    def is_connected(self) -> bool:
        """Check if publisher is connected."""
        return (
            self._connection is not None
            and not self._connection.is_closed
            and self._channel is not None
            and not self._channel.is_closed
        )

    async def publish(self, message: OutboxMessage, options: Optional[PublishOptions] = None) -> None:
        """Publish an outbox message to RabbitMQ.

        Body format (camelCase JSON, compatible with Node.js):
        {
            "id": "...",
            "aggregateType": "...",
            "aggregateId": "...",
            "eventType": "...",
            "payload": {...},
            "metadata": {...},
            "createdAt": "2026-01-01T00:00:00.000Z"
        }
        """
        if not self._exchange:
            raise RuntimeError("Publisher is not connected. Call connect() first.")

        routing_key = self._build_routing_key(message, options)

        # Build camelCase body for Node.js wire format compatibility
        body = {
            "id": message.id,
            "aggregateType": message.aggregate_type,
            "aggregateId": message.aggregate_id,
            "eventType": message.event_type,
            "payload": message.payload,
            "metadata": message.metadata,
            "createdAt": message.created_at.isoformat(),
        }

        # Compute timestamp as datetime for AMQP (aio-pika handles conversion)
        created_utc = message.created_at.replace(tzinfo=timezone.utc) if message.created_at.tzinfo is None else message.created_at

        # Build AMQP headers
        headers: dict[str, Any] = {
            "x-aggregate-type": message.aggregate_type,
            "x-aggregate-id": message.aggregate_id,
            "x-event-type": message.event_type,
        }
        # Add W3C traceparent header if trace context exists in metadata
        if message.metadata and message.metadata.get("traceId"):
            trace_id = str(message.metadata["traceId"])
            span_id = str(message.metadata.get("spanId", "0000000000000000"))
            headers["traceparent"] = f"00-{trace_id}-{span_id}-01"
        if options and options.headers:
            headers.update(options.headers)

        amqp_message = Message(
            body=json.dumps(body, default=str).encode("utf-8"),
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
            message_id=message.id,
            timestamp=created_utc,
            headers=headers,
        )

        if options and options.priority is not None:
            amqp_message.priority = options.priority
        if options and options.expiration is not None:
            amqp_message.expiration = options.expiration

        exchange = self._exchange
        if options and options.exchange:
            # Use custom exchange if specified
            exchange = await self._channel.declare_exchange(
                options.exchange, aio_pika.ExchangeType.TOPIC, durable=True
            )

        await exchange.publish(amqp_message, routing_key=routing_key)
        logger.debug(f"Published message {message.id} to '{self._exchange_name}' with key '{routing_key}'")

    @staticmethod
    def _build_routing_key(message: OutboxMessage, options: Optional[PublishOptions] = None) -> str:
        """Build routing key from message properties.

        Format: {aggregateType}.{eventType}
        """
        if options and options.routing_key:
            return options.routing_key
        return f"{message.aggregate_type}.{message.event_type}"
