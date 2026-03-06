from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel
from .enums import InboxMessageStatus


class CreateInboxMessageDto(BaseModel):
    message_id: str
    source: str
    event_type: str
    payload: dict[str, Any]
    metadata: Optional[dict[str, Any]] = None
    max_retries: Optional[int] = None


class InboxMessage(BaseModel):
    id: str
    message_id: str
    source: str
    event_type: str
    payload: dict[str, Any]
    metadata: Optional[dict[str, Any]] = None
    status: InboxMessageStatus
    retry_count: int = 0
    max_retries: int = 3
    processed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    recovery_attempts: int = 0
    last_recovered_at: Optional[datetime] = None
    recovery_reason: Optional[str] = None
