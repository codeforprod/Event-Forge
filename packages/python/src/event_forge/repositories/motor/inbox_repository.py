"""Motor (async MongoDB) implementation of IInboxRepository.

Uses unique index on (message_id, source) for deduplication
and findOneAndUpdate for atomic retry locking.
"""

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from ...models import CreateInboxMessageDto, InboxMessage
from ...models.enums import InboxMessageStatus
from ..interfaces import IInboxRepository, RecordInboxMessageResult

# Index definitions — call ensure_indexes() once at startup
INBOX_INDEXES = [
    {
        "keys": [("message_id", 1), ("source", 1)],
        "name": "idx_inbox_message_source_unique",
        "unique": True,
    },
    {
        "keys": [("event_type", 1), ("created_at", 1)],
        "name": "idx_inbox_event_type",
    },
    {
        "keys": [("status", 1), ("created_at", 1)],
        "name": "idx_inbox_cleanup",
    },
    {
        "keys": [("status", 1), ("retry_count", 1), ("scheduled_at", 1), ("created_at", 1)],
        "name": "idx_inbox_retry",
    },
]


class MotorInboxRepository(IInboxRepository):
    """MongoDB inbox repository using Motor async driver.

    Equivalent of the Node.js MongooseInboxRepository:
    - Deduplication via unique compound index on (message_id, source)
    - DuplicateKeyError (code 11000) handling for race conditions
    - findOneAndUpdate for atomic retry locking
    """

    def __init__(self, db: AsyncIOMotorDatabase, collection: str = "inbox_messages") -> None:
        self._db = db
        self._collection: AsyncIOMotorCollection = db[collection]

    async def ensure_indexes(self) -> None:
        """Create indexes. Call once at application startup."""
        for idx in INBOX_INDEXES:
            await self._collection.create_index(
                idx["keys"],
                name=idx["name"],
                unique=idx.get("unique", False),
            )

    async def record(self, dto: CreateInboxMessageDto) -> RecordInboxMessageResult:
        # Check if message already exists
        existing = await self._collection.find_one({
            "message_id": dto.message_id,
            "source": dto.source,
        })

        if existing:
            return RecordInboxMessageResult(
                message=self._to_model(existing),
                is_duplicate=True,
            )

        now = datetime.now(timezone.utc)
        doc = {
            "message_id": dto.message_id,
            "source": dto.source,
            "event_type": dto.event_type,
            "payload": dto.payload,
            "status": InboxMessageStatus.RECEIVED.value,
            "retry_count": 0,
            "max_retries": dto.max_retries if dto.max_retries is not None else 3,
            "error_message": None,
            "scheduled_at": None,
            "processed_at": None,
            "created_at": now,
        }

        try:
            result = await self._collection.insert_one(doc)
            doc["_id"] = result.inserted_id
            return RecordInboxMessageResult(
                message=self._to_model(doc),
                is_duplicate=False,
            )
        except DuplicateKeyError:
            # Race condition: another worker inserted between find and insert
            existing = await self._collection.find_one({
                "message_id": dto.message_id,
                "source": dto.source,
            })

            if not existing:
                raise RuntimeError(
                    f"Race condition: duplicate key error but message not found "
                    f"for message_id={dto.message_id}, source={dto.source}"
                )

            return RecordInboxMessageResult(
                message=self._to_model(existing),
                is_duplicate=True,
            )

    async def exists(self, message_id: str, source: str) -> bool:
        count = await self._collection.count_documents({
            "message_id": message_id,
            "source": source,
        })
        return count > 0

    async def mark_processing(self, message_id: str) -> None:
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"status": InboxMessageStatus.PROCESSING.value}},
        )

    async def mark_processed(self, message_id: str) -> None:
        now = datetime.now(timezone.utc)
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {
                "$set": {
                    "status": InboxMessageStatus.PROCESSED.value,
                    "processed_at": now,
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
            InboxMessageStatus.PERMANENTLY_FAILED.value
            if permanent
            else InboxMessageStatus.FAILED.value
        )
        await self._collection.update_one(
            {"_id": ObjectId(message_id)},
            {
                "$set": {
                    "status": status,
                    "error_message": error,
                    "scheduled_at": scheduled_at,
                },
                "$inc": {"retry_count": 1},
            },
        )

    async def find_retryable(self, limit: int) -> list[InboxMessage]:
        """Find failed messages eligible for retry using atomic findOneAndUpdate.

        Uses $expr to compare retryCount < maxRetries within the same document.
        """
        now = datetime.now(timezone.utc)
        messages: list[InboxMessage] = []

        for _ in range(limit):
            doc = await self._collection.find_one_and_update(
                {
                    "status": InboxMessageStatus.FAILED.value,
                    "$expr": {"$lt": ["$retry_count", "$max_retries"]},
                    "$or": [{"scheduled_at": None}, {"scheduled_at": {"$lte": now}}],
                },
                {
                    "$set": {"status": InboxMessageStatus.PROCESSING.value},
                },
                sort=[("created_at", 1)],
                return_document=True,
            )

            if doc is None:
                break

            messages.append(self._to_model(doc))

        return messages

    async def delete_older_than(self, date: datetime) -> int:
        result = await self._collection.delete_many({
            "status": InboxMessageStatus.PROCESSED.value,
            "created_at": {"$lt": date},
        })
        return result.deleted_count

    @staticmethod
    def _to_model(doc: dict[str, Any]) -> InboxMessage:
        return InboxMessage(
            id=str(doc["_id"]),
            message_id=doc["message_id"],
            source=doc["source"],
            event_type=doc["event_type"],
            payload=doc["payload"],
            status=doc["status"],
            retry_count=doc.get("retry_count", 0),
            max_retries=doc.get("max_retries", 3),
            error_message=doc.get("error_message"),
            scheduled_at=doc.get("scheduled_at"),
            processed_at=doc.get("processed_at"),
            created_at=doc["created_at"],
        )
