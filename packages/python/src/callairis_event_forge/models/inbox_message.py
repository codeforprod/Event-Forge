from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel
from .enums import InboxMessageStatus
class CreateInboxMessageDto(BaseModel):
    message_id: str; source: str; event_type: str; payload: dict[str, Any]
class InboxMessage(BaseModel):
    id: str; message_id: str; source: str; event_type: str; payload: dict[str, Any]
    status: InboxMessageStatus; processed_at: Optional[datetime] = None
    error_message: Optional[str] = None; created_at: datetime
