from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Callable, Awaitable, TypeVar
from pydantic import BaseModel
from ..models import CreateInboxMessageDto, CreateOutboxMessageDto, InboxMessage, OutboxMessage

T = TypeVar("T")


class RecordInboxMessageResult(BaseModel):
    message: InboxMessage
    is_duplicate: bool


class IOutboxRepository(ABC):
    @abstractmethod
    async def create(
        self, dto: CreateOutboxMessageDto, transaction_context: Any | None = None
    ) -> OutboxMessage:
        pass

    @abstractmethod
    async def fetch_and_lock_pending(self, limit: int, locker_id: str) -> list[OutboxMessage]:
        pass

    @abstractmethod
    async def find_and_lock_by_id(self, message_id: str, locker_id: str) -> OutboxMessage | None:
        """Find a specific message by ID and lock it for processing.
        Used for event-driven processing (immediate publish on create).
        """
        pass

    @abstractmethod
    async def mark_published(self, message_id: str) -> None:
        pass

    @abstractmethod
    async def mark_failed(
        self,
        message_id: str,
        error: str,
        permanent: bool = False,
        scheduled_at: datetime | None = None,
    ) -> None:
        pass

    @abstractmethod
    async def release_lock(self, message_id: str) -> None:
        pass

    @abstractmethod
    async def release_stale_locks(self, older_than: datetime) -> int:
        pass

    @abstractmethod
    async def delete_older_than(self, date: datetime) -> int:
        pass

    @abstractmethod
    async def with_transaction(
        self, operation: Callable[[Any], Awaitable[T]]
    ) -> T:
        pass


class IInboxRepository(ABC):
    @abstractmethod
    async def record(self, dto: CreateInboxMessageDto) -> RecordInboxMessageResult:
        pass

    @abstractmethod
    async def exists(self, message_id: str, source: str) -> bool:
        pass

    @abstractmethod
    async def mark_processing(self, message_id: str) -> None:
        pass

    @abstractmethod
    async def mark_processed(self, message_id: str) -> None:
        pass

    @abstractmethod
    async def mark_failed(
        self,
        message_id: str,
        error: str,
        permanent: bool = False,
        scheduled_at: datetime | None = None,
    ) -> None:
        pass

    @abstractmethod
    async def delete_older_than(self, date: datetime) -> int:
        pass
