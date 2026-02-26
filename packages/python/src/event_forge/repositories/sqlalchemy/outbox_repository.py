import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, TypeVar
from uuid import uuid4

from sqlalchemy import select, update, delete, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ...models import CreateOutboxMessageDto, OutboxMessage
from ...models.enums import OutboxMessageStatus
from ..interfaces import IOutboxRepository
from .entities import OutboxMessageEntity

logger = logging.getLogger(__name__)
T = TypeVar("T")


class SQLAlchemyOutboxRepository(IOutboxRepository):
    """SQLAlchemy outbox repository with SELECT FOR UPDATE SKIP LOCKED."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def create(
        self, dto: CreateOutboxMessageDto, transaction_context: Any | None = None
    ) -> OutboxMessage:
        now = datetime.now(timezone.utc)
        entity = OutboxMessageEntity(
            id=str(uuid4()),
            aggregate_type=dto.aggregate_type,
            aggregate_id=dto.aggregate_id,
            event_type=dto.event_type,
            payload=dto.payload,
            metadata_=dto.metadata,
            status=OutboxMessageStatus.PENDING.value,
            retry_count=0,
            max_retries=dto.max_retries,
            scheduled_at=dto.scheduled_at,
            created_at=now,
            updated_at=now,
        )

        if transaction_context is not None:
            session: AsyncSession = transaction_context
            session.add(entity)
            await session.flush()
        else:
            async with self._session_factory() as session:
                session.add(entity)
                await session.commit()

        return self._to_model(entity)

    async def fetch_and_lock_pending(self, limit: int, locker_id: str) -> list[OutboxMessage]:
        now = datetime.now(timezone.utc)
        async with self._session_factory() as session:
            # SELECT FOR UPDATE SKIP LOCKED — safe for concurrent consumers
            stmt = (
                select(OutboxMessageEntity)
                .where(
                    and_(
                        OutboxMessageEntity.status.in_([
                            OutboxMessageStatus.PENDING.value,
                            OutboxMessageStatus.FAILED.value,
                        ]),
                        OutboxMessageEntity.locked_by.is_(None),
                        or_(
                            OutboxMessageEntity.scheduled_at.is_(None),
                            OutboxMessageEntity.scheduled_at <= now,
                        ),
                    )
                )
                .order_by(OutboxMessageEntity.created_at)
                .limit(limit)
                .with_for_update(skip_locked=True)
            )

            result = await session.execute(stmt)
            entities = result.scalars().all()

            # Lock the fetched rows
            ids = [e.id for e in entities]
            if ids:
                await session.execute(
                    update(OutboxMessageEntity)
                    .where(OutboxMessageEntity.id.in_(ids))
                    .values(
                        locked_by=locker_id,
                        locked_at=now,
                        status=OutboxMessageStatus.PROCESSING.value,
                        updated_at=now,
                    )
                )

                # Re-fetch updated values before commit (while locks are held)
                result = await session.execute(
                    select(OutboxMessageEntity).where(OutboxMessageEntity.id.in_(ids))
                )
                entities = result.scalars().all()

                await session.commit()

            return [self._to_model(e) for e in entities]

    async def mark_published(self, message_id: str) -> None:
        async with self._session_factory() as session:
            await session.execute(
                update(OutboxMessageEntity)
                .where(OutboxMessageEntity.id == message_id)
                .values(
                    status=OutboxMessageStatus.PUBLISHED.value,
                    locked_by=None,
                    locked_at=None,
                    updated_at=datetime.now(timezone.utc),
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
                status = OutboxMessageStatus.PERMANENTLY_FAILED.value
            else:
                status = OutboxMessageStatus.FAILED.value

            values: dict[str, Any] = {
                "status": status,
                "error_message": error,
                "locked_by": None,
                "locked_at": None,
                "updated_at": datetime.now(timezone.utc),
                "retry_count": OutboxMessageEntity.retry_count + 1,
            }
            if scheduled_at is not None:
                values["scheduled_at"] = scheduled_at

            await session.execute(
                update(OutboxMessageEntity)
                .where(OutboxMessageEntity.id == message_id)
                .values(**values)
            )
            await session.commit()

    async def release_lock(self, message_id: str) -> None:
        async with self._session_factory() as session:
            await session.execute(
                update(OutboxMessageEntity)
                .where(OutboxMessageEntity.id == message_id)
                .values(
                    locked_by=None,
                    locked_at=None,
                    status=OutboxMessageStatus.PENDING.value,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()

    async def release_stale_locks(self, older_than: datetime) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                update(OutboxMessageEntity)
                .where(
                    and_(
                        OutboxMessageEntity.locked_by.isnot(None),
                        OutboxMessageEntity.locked_at < older_than,
                    )
                )
                .values(
                    locked_by=None,
                    locked_at=None,
                    status=OutboxMessageStatus.PENDING.value,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await session.commit()
            return result.rowcount  # type: ignore[return-value]

    async def delete_older_than(self, date: datetime) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                delete(OutboxMessageEntity)
                .where(
                    and_(
                        OutboxMessageEntity.status == OutboxMessageStatus.PUBLISHED.value,
                        OutboxMessageEntity.created_at < date,
                    )
                )
            )
            await session.commit()
            return result.rowcount  # type: ignore[return-value]

    async def with_transaction(self, operation: Callable[[Any], Awaitable[T]]) -> T:
        async with self._session_factory() as session:
            async with session.begin():
                result = await operation(session)
                return result

    @staticmethod
    def _to_model(entity: OutboxMessageEntity) -> OutboxMessage:
        return OutboxMessage(
            id=entity.id,
            aggregate_type=entity.aggregate_type,
            aggregate_id=entity.aggregate_id,
            event_type=entity.event_type,
            payload=entity.payload,
            metadata=entity.metadata_,
            status=OutboxMessageStatus(entity.status),
            retry_count=entity.retry_count,
            max_retries=entity.max_retries,
            error_message=entity.error_message,
            scheduled_at=entity.scheduled_at,
            locked_by=entity.locked_by,
            locked_at=entity.locked_at,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )
