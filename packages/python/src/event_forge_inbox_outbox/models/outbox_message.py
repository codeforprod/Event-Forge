"""Outbox message models matching TypeScript interfaces."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from .enums import OutboxMessageStatus


class CreateOutboxMessageDto(BaseModel):
    """DTO for creating an outbox message."""

    aggregate_type: str = Field(..., description="Type of the aggregate (entity)")
    aggregate_id: str = Field(..., description="ID of the specific aggregate instance")
    event_type: str = Field(..., description="Type of event being published")
    payload: dict[str, Any] = Field(..., description="Event payload data")
    metadata: Optional[dict[str, Any]] = Field(None, description="Optional metadata")
    scheduled_at: Optional[datetime] = Field(None, description="When to process (delayed messages)")
    max_retries: int = Field(5, description="Maximum retry attempts")


class OutboxMessage(BaseModel):
    """Outbox message entity."""

    id: str = Field(..., description="Unique identifier")
    aggregate_type: str = Field(..., description="Type of the aggregate")
    aggregate_id: str = Field(..., description="ID of the aggregate instance")
    event_type: str = Field(..., description="Type of event")
    payload: dict[str, Any] = Field(..., description="Event payload")
    metadata: Optional[dict[str, Any]] = Field(None, description="Optional metadata")
    status: OutboxMessageStatus = Field(..., description="Processing status")
    retry_count: int = Field(0, description="Number of retry attempts")
    max_retries: int = Field(5, description="Maximum retry attempts")
    error_message: Optional[str] = Field(None, description="Error from last failed attempt")
    scheduled_at: Optional[datetime] = Field(None, description="When to process")
    locked_by: Optional[str] = Field(None, description="Worker/process that locked this")
    locked_at: Optional[datetime] = Field(None, description="When the message was locked")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    class Config:
        """Pydantic configuration."""

        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "aggregate_type": "User",
                "aggregate_id": "user-123",
                "event_type": "user.created",
                "payload": {"email": "user@example.com", "name": "John Doe"},
                "metadata": {"correlation_id": "req-456"},
                "status": "pending",
                "retry_count": 0,
                "max_retries": 5,
                "created_at": "2024-01-06T10:00:00Z",
                "updated_at": "2024-01-06T10:00:00Z",
            }
        }
