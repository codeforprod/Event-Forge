import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, update, delete, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ...models import CreateInboxMessageDto, InboxMessage
from ...models.enums import InboxMessageStatus
from ..interfaces import IInboxRepository, RecordInboxMessageResult
from .entities import InboxMessageEntity

logger = logging.getLogger(__name__)

# Statuses that indicate the message should be reprocessed (not a true duplicate)
_REPROCESSABLE_STATUSES = {
    InboxMessageStatus.PROCESSING.value,
    InboxMessageStatus.FAILED.value,
}

# Statuses that indicate the message is truly done (duplicate)
_TERMINAL_STATUSES = {
    InboxMessageStatus.PROCESSED.value,
    InboxMessageStatus.PERMANENTLY_FAILED.value,
    InboxMessageStatus.RECEIVED.value,
}


class SQLAlchemyInboxRepository(IInboxRepository):
    """SQLAlchemy inbox repository with deduplication via UNIQUE constraint."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def record(self, dto: CreateInboxMessageDto) -> RecordInboxMessageResult:
        async with self._session_factory() as session:
            # Try to insert — unique constraint on (message_id, source) handles dedup
            entity = InboxMessageEntity(
                id=str(uuid4()),
                message_id=dto.message_id,
                source=dto.source,
                event_type=dto.event_type,
                payload=dto.payload,
                metadata_=dto.metadata,
                status=InboxMessageStatus.RECEIVED.value,
                retry_count=0,
                max_retries=dto.max_retries if dto.max_retries is not None else 3,
                created_at=datetime.now(timezone.utc),
            )

            try:
                session.add(entity)
                await session.commit()
                return RecordInboxMessageResult(
                    message=self._to_model(entity),
                    is_duplicate=False,
                )
            except IntegrityError:
                await session.rollback()
                # Fetch existing message
                result = await session.execute(
                    select(InboxMessageEntity).where(
                        and_(
                            InboxMessageEntity.message_id == dto.message_id,
                            InboxMessageEntity.source == dto.source,
                        )
                    )
                )
                existing = result.scalar_one()

                # Status-aware deduplication:
                # PROCESSING/FAILED → not a duplicate (needs reprocessing after recovery)
                # PROCESSED/PERMANENTLY_FAILED/RECEIVED → true duplicate
                is_duplicate = existing.status not in _REPROCESSABLE_STATUSES
                return RecordInboxMessageResult(
                    message=self._to_model(existing),
                    is_duplicate=is_duplicate,
                )

    async def exists(self, message_id: str, source: str) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(InboxMessageEntity.id).where(
                    and_(
                        InboxMessageEntity.message_id == message_id,
                        InboxMessageEntity.source == source,
                    )
                )
            )
            return result.scalar_one_or_none() is not None

    async def mark_processing(self, message_id: str) -> bool:
        """Atomically transition to PROCESSING. Only from RECEIVED or FAILED."""
        async with self._session_factory() as session:
            result = await session.execute(
                update(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.id == message_id,
                        InboxMessageEntity.status.in_([
                            InboxMessageStatus.RECEIVED.value,
                            InboxMessageStatus.FAILED.value,
                        ]),
                    )
                )
                .values(status=InboxMessageStatus.PROCESSING.value)
            )
            await session.commit()
            return (result.rowcount or 0) > 0

    async def mark_processed(self, message_id: str) -> None:
        async with self._session_factory() as session:
            await session.execute(
                update(InboxMessageEntity)
                .where(InboxMessageEntity.id == message_id)
                .values(
                    status=InboxMessageStatus.PROCESSED.value,
                    processed_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

    async def mark_failed(
        self,
        message_id: str,
        error: str,
        permanent: bool = False,
        scheduled_at: datetime | None = None,
    ) -> None:
        async with self._session_factory() as session:
            if permanent:
                status = InboxMessageStatus.PERMANENTLY_FAILED.value
            else:
                status = InboxMessageStatus.FAILED.value

            values: dict[str, Any] = {
                "status": status,
                "error_message": error,
                "retry_count": InboxMessageEntity.retry_count + 1,
            }
            if scheduled_at is not None:
                values["scheduled_at"] = scheduled_at

            await session.execute(
                update(InboxMessageEntity)
                .where(InboxMessageEntity.id == message_id)
                .values(**values)
            )
            await session.commit()

    async def find_retryable(self, limit: int) -> list[InboxMessage]:
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            stmt = (
                select(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.status == InboxMessageStatus.FAILED.value,
                        InboxMessageEntity.retry_count < InboxMessageEntity.max_retries,
                        or_(
                            InboxMessageEntity.scheduled_at.is_(None),
                            InboxMessageEntity.scheduled_at <= now,
                        ),
                    )
                )
                .order_by(InboxMessageEntity.scheduled_at)
                .limit(limit)
            )
            result = await session.execute(stmt)
            return [self._to_model(e) for e in result.scalars().all()]

    async def find_stuck_processing(self, cutoff_date: datetime, limit: int) -> list[InboxMessage]:
        """Find messages stuck in PROCESSING status since before cutoff_date."""
        async with self._session_factory() as session:
            stmt = (
                select(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.status == InboxMessageStatus.PROCESSING.value,
                        or_(
                            InboxMessageEntity.updated_at < cutoff_date,
                            InboxMessageEntity.updated_at.is_(None),
                        ),
                    )
                )
                .order_by(InboxMessageEntity.updated_at.asc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return [self._to_model(e) for e in result.scalars().all()]

    async def reset_for_retry(self, message_id: str, reason: str) -> bool:
        """Atomically reset a PROCESSING message to FAILED for retry."""
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            result = await session.execute(
                update(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.id == message_id,
                        InboxMessageEntity.status == InboxMessageStatus.PROCESSING.value,
                    )
                )
                .values(
                    status=InboxMessageStatus.FAILED.value,
                    recovery_attempts=InboxMessageEntity.recovery_attempts + 1,
                    last_recovered_at=now,
                    recovery_reason=reason,
                )
            )
            await session.commit()
            return (result.rowcount or 0) > 0

    async def mark_permanently_failed_recovery(self, message_id: str, reason: str) -> None:
        """Mark a PROCESSING message as PERMANENTLY_FAILED during recovery."""
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            await session.execute(
                update(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.id == message_id,
                        InboxMessageEntity.status == InboxMessageStatus.PROCESSING.value,
                    )
                )
                .values(
                    status=InboxMessageStatus.PERMANENTLY_FAILED.value,
                    recovery_attempts=InboxMessageEntity.recovery_attempts + 1,
                    last_recovered_at=now,
                    recovery_reason=reason,
                )
            )
            await session.commit()

    async def delete_older_than(self, date: datetime) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                delete(InboxMessageEntity)
                .where(
                    and_(
                        InboxMessageEntity.status == InboxMessageStatus.PROCESSED.value,
                        InboxMessageEntity.created_at < date,
                    )
                )
            )
            await session.commit()
            return result.rowcount  # type: ignore[return-value]

    @staticmethod
    def _to_model(entity: InboxMessageEntity) -> InboxMessage:
        return InboxMessage(
            id=entity.id,
            message_id=entity.message_id,
            source=entity.source,
            event_type=entity.event_type,
            payload=entity.payload,
            metadata=entity.metadata_,
            status=InboxMessageStatus(entity.status),
            retry_count=entity.retry_count,
            max_retries=entity.max_retries,
            processed_at=entity.processed_at,
            error_message=entity.error_message,
            scheduled_at=entity.scheduled_at,
            created_at=entity.created_at,
            updated_at=getattr(entity, 'updated_at', None),
            recovery_attempts=getattr(entity, 'recovery_attempts', 0),
            last_recovered_at=getattr(entity, 'last_recovered_at', None),
            recovery_reason=getattr(entity, 'recovery_reason', None),
        )
