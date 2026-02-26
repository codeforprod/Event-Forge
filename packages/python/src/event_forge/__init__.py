"""Event-Forge Inbox-Outbox Pattern Library for Python."""
__version__ = "1.2.0"

# Models
from .models import (
    CreateInboxMessageDto,
    CreateOutboxMessageDto,
    InboxMessage,
    InboxMessageStatus,
    OutboxMessage,
    OutboxMessageStatus,
)

# Errors
from .errors import DuplicateMessageError, ProcessingError

# Config
from .config import InboxConfig, OutboxConfig

# Events
from .events import InboxEvents, OutboxEvents, SimpleEventEmitter

# Services
from .services import InboxService, OutboxService

# Repository interfaces
from .repositories import IInboxRepository, IOutboxRepository, RecordInboxMessageResult

# Publisher interfaces
from .publishers import IMessagePublisher, PublishOptions

# Client facade
from .client import EventForgeAgentClient

__all__ = [
    # Models
    "CreateInboxMessageDto",
    "CreateOutboxMessageDto",
    "InboxMessage",
    "InboxMessageStatus",
    "OutboxMessage",
    "OutboxMessageStatus",
    # Errors
    "DuplicateMessageError",
    "ProcessingError",
    # Config
    "InboxConfig",
    "OutboxConfig",
    # Events
    "InboxEvents",
    "OutboxEvents",
    "SimpleEventEmitter",
    # Services
    "InboxService",
    "OutboxService",
    # Repository interfaces
    "IInboxRepository",
    "IOutboxRepository",
    "RecordInboxMessageResult",
    # Publisher interfaces
    "IMessagePublisher",
    "PublishOptions",
    # Client facade
    "EventForgeAgentClient",
]
