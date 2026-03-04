import pytest
from datetime import datetime
from event_forge.models import (
    CreateInboxMessageDto, CreateOutboxMessageDto, InboxMessage, InboxMessageStatus, OutboxMessage, OutboxMessageStatus,
)
def test_create_outbox_message_dto():
    dto = CreateOutboxMessageDto(aggregate_type="User", aggregate_id="user-123", event_type="user.created", payload={"email": "test@example.com"})
    assert dto.aggregate_type == "User" and dto.max_retries == 3
def test_outbox_message():
    now = datetime.utcnow()
    message = OutboxMessage(id="550e8400", aggregate_type="User", aggregate_id="user-123", event_type="user.created", payload={"email": "test@example.com"}, metadata={"correlation_id": "req-456"}, status=OutboxMessageStatus.PENDING, retry_count=0, max_retries=5, created_at=now, updated_at=now)
    assert message.status == OutboxMessageStatus.PENDING
def test_create_inbox_message_dto():
    dto = CreateInboxMessageDto(message_id="ext-msg-123", source="external-system", event_type="order.placed", payload={"order_id": "order-456"})
    assert dto.message_id == "ext-msg-123"
    assert dto.metadata is None

def test_create_inbox_message_dto_with_metadata():
    metadata = {"traceId": "abc123def456", "spanId": "span789"}
    dto = CreateInboxMessageDto(message_id="ext-msg-456", source="rabbitmq", event_type="user.created", payload={"user_id": "u-1"}, metadata=metadata)
    assert dto.metadata == metadata
    assert dto.metadata["traceId"] == "abc123def456"
    assert dto.metadata["spanId"] == "span789"

def test_create_inbox_message_dto_with_empty_metadata():
    dto = CreateInboxMessageDto(message_id="ext-msg-789", source="rabbitmq", event_type="user.updated", payload={"user_id": "u-2"}, metadata={})
    assert dto.metadata == {}
def test_inbox_message():
    now = datetime.utcnow()
    message = InboxMessage(id="550e8401", message_id="ext-msg-123", source="external-system", event_type="order.placed", payload={"order_id": "order-456"}, status=InboxMessageStatus.RECEIVED, created_at=now)
    assert message.status == InboxMessageStatus.RECEIVED
