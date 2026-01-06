from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel
from .enums import OutboxMessageStatus
class CreateOutboxMessageDto(BaseModel):
    aggregate_type: str; aggregate_id: str; event_type: str; payload: dict[str, Any]
    metadata: Optional[dict[str, Any]] = None; scheduled_at: Optional[datetime] = None; max_retries: int = 5
class OutboxMessage(BaseModel):
    id: str; aggregate_type: str; aggregate_id: str; event_type: str; payload: dict[str, Any]
    metadata: Optional[dict[str, Any]] = None; status: OutboxMessageStatus; retry_count: int = 0
    max_retries: int = 5; error_message: Optional[str] = None; scheduled_at: Optional[datetime] = None
    locked_by: Optional[str] = None; locked_at: Optional[datetime] = None; created_at: datetime; updated_at: datetime
