"""Event-Forge Inbox-Outbox Pattern Library for Python.

This library implements the Transactional Inbox-Outbox pattern for reliable
message delivery in distributed systems.
"""

__version__ = "1.0.0"

from .models import (
    CreateInboxMessageDto,
    CreateOutboxMessageDto,
    InboxMessage,
    InboxMessageStatus,
    OutboxMessage,
    OutboxMessageStatus,
)
from .errors import DuplicateMessageError, ProcessingError
from .services import InboxService, OutboxService

__all__ = [
    "CreateInboxMessageDto",
    "CreateOutboxMessageDto",
    "InboxMessage",
    "InboxMessageStatus",
    "OutboxMessage",
    "OutboxMessageStatus",
    "DuplicateMessageError",
    "ProcessingError",
    "InboxService",
    "OutboxService",
]
