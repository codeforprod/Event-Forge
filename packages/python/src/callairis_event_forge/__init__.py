"""Event-Forge Inbox-Outbox Pattern Library for Python."""
__version__ = "1.0.0"

from .models import (
    CreateInboxMessageDto, CreateOutboxMessageDto,
    InboxMessage, InboxMessageStatus,
    OutboxMessage, OutboxMessageStatus,
)
from .errors import DuplicateMessageError, ProcessingError
from .services import InboxService, OutboxService

__all__ = [
    "CreateInboxMessageDto", "CreateOutboxMessageDto",
    "InboxMessage", "InboxMessageStatus",
    "OutboxMessage", "OutboxMessageStatus",
    "DuplicateMessageError", "ProcessingError",
    "InboxService", "OutboxService",
]
