"""Motor (async MongoDB) implementation of IOutboxRepository.

Uses findOneAndUpdate for atomic locking — MongoDB's equivalent
of PostgreSQL's SELECT FOR UPDATE SKIP LOCKED.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, TypeVar

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from ...models import CreateOutboxMessageDto, OutboxMessage
from ...models.enums import OutboxMessageStatus
from ..interfaces import IOutboxRepository

T = TypeVar("T")

# Index definitions — call ensure_indexes() once at startup
OUTBOX_INDEXES = [
    {
        "keys": [("status", 1), ("scheduled_at", 1), ("created_at", 1)],
        "name": "idx_outbox_pending_processing",
    },
    {
        "keys": [("status", 1), ("created_at", 1)],
        "name": "idx_outbox_cleanup",
    },
    {
        "keys": [("status", 1), ("locked_at", 1)],
        "name": "idx_outbox_stale_locks",
    },
]


class MotorOutboxRepository(IOutboxRepository):
    """MongoDB outbox repository using Motor async driver.

    Equivalent of the Node.js MongooseOutboxRepository:
    - findOneAndUpdate loop for atomic lock acquisition
    - Optimistic locking via lockedBy/lockedAt fields
    - Stale lock release for crashed workers
    """

    def __init__(self, client: AsyncIOMotorClient, database: str, collection: str = "outbox_messages") -> None:
        self._client = client
        self._db = client[database]
        self._collection: AsyncIOMotorCollection = self._db[collection]

    async def ensure_indexes(self) -> None:
        """Create indexes. Call once at application startup."""
        for idx in OUTBOX_INDEXES:
            await self._collection.create_index(idx["keys"], name=idx["name"])

    async def create(
        self, dto: CreateOutboxMessageDto, transaction_context: Any | None = None
    ) -> OutboxMessage:
        now = datetime.now(timezone.utc)
        doc = {
            "aggregate_type": dto.aggregate_type,
            "aggregate_id": dto.aggregate_id,
            "event_type": dto.event_type,
            "payload": dto.payload,
            "metadata": dto.metadata or {},
            "status": OutboxMessageStatus.PENDING.value,
            "retry_count": 0,
            "max_retries": dto.max_retries if dto.max_retries is not None else 3,
            "error_message": None,
            "scheduled_at": dto.scheduled_at,
            "locked_by": None,
            "locked_at": None,
            "created_at": now,
            "updated_at": now,
        }

        session = transaction_context
        result = await self._collection.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return self._to_model(doc)

    async def fetch_and_lock_pending(self, limit: int, locker_id: str) -> list[OutboxMessage]:
        """Atomic lock acquisition using findOneAndUpdate in a loop.

        This is MongoDB's equivalent of PostgreSQL's SELECT FOR UPDATE SKIP LOCKED.
        Each findOneAndUpdate atomically finds one unlocked message and locks it.
        """
        now = datetime.now(timezone.utc)
        lock_timeout = now - timedelta(minutes=5)
        messages: list[OutboxMessage] = []

        for _ in range(limit):
            doc = await self._collection.find_one_and_update(
                {
                    "status": {"$in": [
                        OutboxMessageStatus.PENDING.value,
                        OutboxMessageStatus.FAILED.value,
                    ]},
                    "$and": [
                        {"$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": now}}]},
                        {"$or": [{"locked_at": None}, {"locked_at": {"$lt": lock_timeout}}]},
                    ],
                },
                {
                    "$set": {
                        "status": OutboxMessageStatus.PROCESSING.value,
                        "locked_by": locker_id,
                        "locked_at": now,
                        "updated_at": now,
                    },
                },
                sort=[("created_at", 1)],
                return_document=True,
            )

            if doc is None:
                break

            messages.append(self._to_model(doc))

        return messages

    async def mark_published(self, message_id: str) -> None:
        now = datetime.now(timezone.utc)
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {
                "$set": {
                    "status": OutboxMessageStatus.PUBLISHED.value,
                    "locked_by": None,
                    "locked_at": None,
                    "updated_at": now,
                },
            },
        )

    async def mark_failed(
        self,
        message_id: str,
        error: str,
        permanent: bool = False,
        scheduled_at: datetime | None = None,
    ) -> None:
        status = (
            OutboxMessageStatus.PERMANENTLY_FAILED.value
            if permanent
            else OutboxMessageStatus.FAILED.value
        )
        now = datetime.now(timezone.utc)
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {
                "$set": {
                    "status": status,
                    "error_message": error,
                    "scheduled_at": scheduled_at,
                    "locked_by": None,
                    "locked_at": None,
                    "updated_at": now,
                },
                "$inc": {"retry_count": 1},
            },
        )

    async def release_lock(self, message_id: str) -> None:
        now = datetime.now(timezone.utc)
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {
                "$set": {
                    "status": OutboxMessageStatus.PENDING.value,
                    "locked_by": None,
                    "locked_at": None,
                    "updated_at": now,
                },
            },
        )

    async def release_stale_locks(self, older_than: datetime) -> int:
        result = await self._collection.update_many(
            {
                "status": OutboxMessageStatus.PROCESSING.value,
                "locked_at": {"$lt": older_than},
            },
            {
                "$set": {
                    "status": OutboxMessageStatus.PENDING.value,
                    "locked_by": None,
                    "locked_at": None,
                    "updated_at": datetime.now(timezone.utc),
                },
            },
        )
        return result.modified_count

    async def delete_older_than(self, date: datetime) -> int:
        result = await self._collection.delete_many({
            "status": OutboxMessageStatus.PUBLISHED.value,
            "created_at": {"$lt": date},
        })
        return result.deleted_count

    async def with_transaction(self, operation: Callable[[Any], Awaitable[T]]) -> T:
        async with await self._client.start_session() as session:
            async with session.start_transaction():
                result = await operation(session)
                return result

    @staticmethod
    def _to_model(doc: dict) -> OutboxMessage:
        return OutboxMessage(
            id=str(doc["_id"]),
            aggregate_type=doc["aggregate_type"],
            aggregate_id=doc["aggregate_id"],
            event_type=doc["event_type"],
            payload=doc["payload"],
            metadata=doc.get("metadata") or {},
            status=doc["status"],
            retry_count=doc.get("retry_count", 0),
            max_retries=doc.get("max_retries", 3),
            error_message=doc.get("error_message"),
            scheduled_at=doc.get("scheduled_at"),
            locked_by=doc.get("locked_by"),
            locked_at=doc.get("locked_at"),
            created_at=doc["created_at"],
            updated_at=doc.get("updated_at", doc["created_at"]),
        )
