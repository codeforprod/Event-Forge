import pytest
from datetime import datetime
from event_forge_inbox_outbox.models import (
    CreateInboxMessageDto, CreateOutboxMessageDto, InboxMessage, InboxMessageStatus, OutboxMessage, OutboxMessageStatus,
)
def test_create_outbox_message_dto():
    dto = CreateOutboxMessageDto(aggregate_type="User", aggregate_id="user-123", event_type="user.created", payload={"email": "test@example.com"})
    assert dto.aggregate_type == "User" and dto.max_retries == 5
def test_outbox_message():
    now = datetime.utcnow()
    message = OutboxMessage(id="550e8400", aggregate_type="User", aggregate_id="user-123", event_type="user.created", payload={"email": "test@example.com"}, metadata={"correlation_id": "req-456"}, status=OutboxMessageStatus.PENDING, retry_count=0, max_retries=5, created_at=now, updated_at=now)
    assert message.status == OutboxMessageStatus.PENDING
def test_create_inbox_message_dto():
    dto = CreateInboxMessageDto(message_id="ext-msg-123", source="external-system", event_type="order.placed", payload={"order_id": "order-456"})
    assert dto.message_id == "ext-msg-123"
def test_inbox_message():
    now = datetime.utcnow()
    message = InboxMessage(id="550e8401", message_id="ext-msg-123", source="external-system", event_type="order.placed", payload={"order_id": "order-456"}, status=InboxMessageStatus.RECEIVED, created_at=now)
    assert message.status == InboxMessageStatus.RECEIVED
