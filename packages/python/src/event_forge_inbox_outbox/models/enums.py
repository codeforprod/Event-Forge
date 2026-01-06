"""Message status enums matching TypeScript enums."""

from enum import Enum


class OutboxMessageStatus(str, Enum):
    """Outbox message status."""

    PENDING = "pending"
    PUBLISHED = "published"
    FAILED = "failed"
    FAILED_PERMANENT = "failed_permanent"


class InboxMessageStatus(str, Enum):
    """Inbox message status."""

    RECEIVED = "received"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
