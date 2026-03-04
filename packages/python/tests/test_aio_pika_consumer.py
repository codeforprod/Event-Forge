"""Tests for AioPikaConsumer metadata propagation."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from event_forge.consumers.aio_pika_consumer import AioPikaConsumer
from event_forge.models import CreateInboxMessageDto


def _make_message(body: dict, message_id: str = "msg-1", headers: dict | None = None):
    """Create a mock aio-pika IncomingMessage."""
    msg = AsyncMock()
    msg.body = json.dumps(body).encode("utf-8")
    msg.message_id = message_id
    msg.headers = headers or {}
    return msg


@pytest.mark.asyncio
async def test_on_message_passes_metadata_to_dto():
    """Metadata from message body must be forwarded to CreateInboxMessageDto."""
    inbox_service = AsyncMock()
    consumer = AioPikaConsumer(
        url="amqp://localhost",
        inbox_service=inbox_service,
        queue_name="test-queue",
    )

    metadata = {"traceId": "abc123", "spanId": "def456"}
    body = {
        "id": "msg-1",
        "eventType": "user.created",
        "payload": {"user_id": "u-1"},
        "metadata": metadata,
    }
    message = _make_message(body)

    await consumer._on_message(message)

    inbox_service.receive_message.assert_called_once()
    dto: CreateInboxMessageDto = inbox_service.receive_message.call_args[0][0]
    assert dto.metadata == metadata
    assert dto.metadata["traceId"] == "abc123"
    assert dto.metadata["spanId"] == "def456"
    message.ack.assert_called_once()


@pytest.mark.asyncio
async def test_on_message_handles_missing_metadata():
    """Messages without metadata field should set metadata=None."""
    inbox_service = AsyncMock()
    consumer = AioPikaConsumer(
        url="amqp://localhost",
        inbox_service=inbox_service,
        queue_name="test-queue",
    )

    body = {
        "id": "msg-2",
        "eventType": "order.placed",
        "payload": {"order_id": "o-1"},
    }
    message = _make_message(body, message_id="msg-2")

    await consumer._on_message(message)

    dto: CreateInboxMessageDto = inbox_service.receive_message.call_args[0][0]
    assert dto.metadata is None
    message.ack.assert_called_once()


@pytest.mark.asyncio
async def test_on_message_preserves_payload_and_event_type():
    """Verify other DTO fields are still correctly populated."""
    inbox_service = AsyncMock()
    consumer = AioPikaConsumer(
        url="amqp://localhost",
        inbox_service=inbox_service,
        queue_name="test-queue",
        source_name="my-source",
    )

    body = {
        "id": "msg-3",
        "eventType": "payment.completed",
        "payload": {"amount": 100},
        "metadata": {"traceId": "t1", "spanId": "s1"},
    }
    message = _make_message(body, message_id="msg-3")
    message.headers = {"x-event-type": "payment.completed"}

    await consumer._on_message(message)

    dto: CreateInboxMessageDto = inbox_service.receive_message.call_args[0][0]
    assert dto.message_id == "msg-3"
    assert dto.source == "my-source"
    assert dto.event_type == "payment.completed"
    assert dto.payload == {"amount": 100}
    assert dto.metadata == {"traceId": "t1", "spanId": "s1"}
