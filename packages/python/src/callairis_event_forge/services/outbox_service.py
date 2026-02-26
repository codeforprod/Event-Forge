import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from ..config import OutboxConfig
from ..errors import ProcessingError
from ..events import OutboxEvents, SimpleEventEmitter
from ..models import CreateOutboxMessageDto, OutboxMessage
from ..publishers.interfaces import IMessagePublisher
from ..repositories.interfaces import IOutboxRepository

logger = logging.getLogger(__name__)


class OutboxService(SimpleEventEmitter):
    """Outbox Service — manages message creation, polling, and publishing.

    Port of the Node.js OutboxService with:
    - Exponential backoff with jitter
    - Stale lock release
    - Concurrency guard (isProcessing flag)
    - Event emission matching Node.js events
    - Cleanup timer for old messages
    """

    def __init__(
        self,
        repository: IOutboxRepository,
        publisher: IMessagePublisher,
        config: Optional[OutboxConfig] = None,
    ) -> None:
        super().__init__()
        self.repository = repository
        self.publisher = publisher
        self.config = config or OutboxConfig()
        self._polling_task: Optional[asyncio.Task[None]] = None
        self._cleanup_task: Optional[asyncio.Task[None]] = None
        self._is_processing = False

    async def create_message(
        self,
        dto: CreateOutboxMessageDto,
        transaction_context: Any | None = None,
    ) -> OutboxMessage:
        """Create a new outbox message, optionally within a transaction context."""
        message = await self.repository.create(dto, transaction_context)

        if self.config.immediate_processing:
            self.emit(OutboxEvents.MESSAGE_CREATED, message.id)

        return message

    async def with_transaction(self, operation: Any) -> Any:
        """Execute operation within a transaction."""
        return await self.repository.with_transaction(operation)

    def start_polling(self) -> None:
        """Start polling for pending messages."""
        if self._polling_task is not None:
            return

        self.emit(OutboxEvents.POLLING_STARTED)
        self._polling_task = asyncio.create_task(self._poll_loop())

        # Start cleanup timer
        self._start_cleanup()

        # Initial poll
        asyncio.create_task(self._poll_and_process())

    def stop_polling(self) -> None:
        """Stop polling."""
        if self._polling_task is not None:
            self._polling_task.cancel()
            self._polling_task = None
            self.emit(OutboxEvents.POLLING_STOPPED)

        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            self._cleanup_task = None

    async def process_message(self, _message_id: str) -> None:
        """Process a specific message immediately (called via event)."""
        await self._poll_and_process()

    async def _poll_loop(self) -> None:
        """Polling loop — runs until cancelled."""
        while True:
            try:
                await asyncio.sleep(self.config.polling_interval)
                await self._poll_and_process()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in outbox polling loop: {e}", exc_info=True)
                self.emit("error", e)

    async def _poll_and_process(self) -> None:
        """Fetch and process pending messages with concurrency guard."""
        if self._is_processing:
            return

        self._is_processing = True
        try:
            # Release stale locks first
            lock_timeout = datetime.now(timezone.utc) - timedelta(seconds=self.config.lock_timeout_seconds)
            await self.repository.release_stale_locks(lock_timeout)

            # Fetch and lock pending messages
            messages = await self.repository.fetch_and_lock_pending(
                self.config.batch_size, self.config.worker_id
            )

            if not messages:
                return

            # Process each message concurrently
            await asyncio.gather(
                *(self._publish_message(msg) for msg in messages),
                return_exceptions=True,
            )
        except Exception as e:
            logger.error(f"Error in poll_and_process: {e}", exc_info=True)
            self.emit("error", e)
        finally:
            self._is_processing = False

    async def _publish_message(self, message: OutboxMessage) -> None:
        """Publish a single message."""
        try:
            await self.publisher.publish(message)
            await self.repository.mark_published(message.id)
            self.emit(OutboxEvents.MESSAGE_PUBLISHED, message)
        except Exception as e:
            await self._handle_publish_error(message, e)

    async def _handle_publish_error(self, message: OutboxMessage, error: Exception) -> None:
        """Handle publishing error with retry logic and backoff."""
        error_message = str(error)
        is_permanent = isinstance(error, ProcessingError)

        if message.retry_count >= message.max_retries or is_permanent:
            await self.repository.mark_failed(message.id, error_message, permanent=True)
            self.emit(OutboxEvents.MESSAGE_FAILED, {
                "message": message, "error": error, "permanent": True,
            })
            return

        # Calculate exponential backoff with jitter
        backoff_delay = self._calculate_backoff(message.retry_count)
        scheduled_at = datetime.now(timezone.utc) + timedelta(milliseconds=backoff_delay)

        await self.repository.mark_failed(
            message.id, error_message, permanent=False, scheduled_at=scheduled_at
        )
        self.emit(OutboxEvents.MESSAGE_FAILED, {
            "message": message, "error": error, "permanent": False,
        })

    def _calculate_backoff(self, retry_count: int) -> float:
        """Calculate exponential backoff delay in milliseconds.

        Formula: min(base * 2^retryCount, max) ± 10% jitter
        """
        base = self.config.backoff_base_seconds
        max_delay = self.config.max_backoff_seconds

        exponential_delay = base * (2 ** retry_count)
        capped_delay = min(exponential_delay, max_delay)

        jitter = capped_delay * 0.1 * (random.random() * 2 - 1)
        final_delay = capped_delay + jitter

        return max(0.0, final_delay * 1000)

    def _start_cleanup(self) -> None:
        """Start cleanup timer for old messages."""
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self) -> None:
        """Cleanup loop — runs until cancelled."""
        # Initial cleanup
        await self._cleanup()
        while True:
            try:
                await asyncio.sleep(self.config.cleanup_interval)
                await self._cleanup()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in outbox cleanup: {e}", exc_info=True)
                self.emit("error", e)

    async def _cleanup(self) -> None:
        """Clean up old published messages."""
        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.config.retention_days)
            deleted = await self.repository.delete_older_than(cutoff_date)
            if deleted > 0:
                self.emit("cleanup", {"deleted": deleted, "cutoff_date": cutoff_date})
        except Exception as e:
            self.emit("error", e)

    async def cleanup_old_messages(self, older_than_days: int = 30) -> int:
        """Manual cleanup of old messages."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        return await self.repository.delete_older_than(cutoff_date)
