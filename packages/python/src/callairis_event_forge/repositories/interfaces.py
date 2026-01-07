from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from pydantic import BaseModel
from ..models import CreateInboxMessageDto, CreateOutboxMessageDto, InboxMessage, OutboxMessage

class RecordInboxMessageResult(BaseModel):
    message: InboxMessage; is_duplicate: bool

class IOutboxRepository(ABC):
    @abstractmethod
    async def create(self, dto: CreateOutboxMessageDto, transaction_context: Any | None = None) -> OutboxMessage: pass
    @abstractmethod
    async def fetch_and_lock_pending(self, limit: int, locker_id: str) -> list[OutboxMessage]: pass
    @abstractmethod
    async def mark_published(self, message_id: str) -> None: pass
    @abstractmethod
    async def mark_failed(self, message_id: str, error: str, permanent: bool = False) -> None: pass
    @abstractmethod
    async def release_lock(self, message_id: str) -> None: pass
    @abstractmethod
    async def release_stale_locks(self, older_than: datetime) -> int: pass
    @abstractmethod
    async def delete_older_than(self, date: datetime) -> int: pass

class IInboxRepository(ABC):
    @abstractmethod
    async def record(self, dto: CreateInboxMessageDto) -> RecordInboxMessageResult: pass
    @abstractmethod
    async def exists(self, message_id: str, source: str) -> bool: pass
    @abstractmethod
    async def mark_processing(self, message_id: str) -> None: pass
    @abstractmethod
    async def mark_processed(self, message_id: str) -> None: pass
    @abstractmethod
    async def mark_failed(self, message_id: str, error: str) -> None: pass
    @abstractmethod
    async def delete_older_than(self, date: datetime) -> int: pass
