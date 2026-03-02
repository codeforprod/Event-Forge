import asyncio
import logging
import random
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from ..config import InboxConfig
from ..errors import DuplicateMessageError, ProcessingError
from ..events import InboxEvents, SimpleEventEmitter
from ..models import CreateInboxMessageDto, InboxMessage
from ..repositories.interfaces import IInboxRepository

logger = logging.getLogger(__name__)
MessageHandler = Callable[[InboxMessage], Awaitable[None]]


class InboxService(SimpleEventEmitter):
    """Inbox Service — manages message reception, deduplication, and processing.

    Retries are handled inline by the consumer (no DB polling).
    """

    def __init__(
        self,
        repository: IInboxRepository,
        config: Optional[InboxConfig] = None,
    ) -> None:
        super().__init__()
        self.repository = repository
        self.config = config or InboxConfig()
        self._handlers: dict[str, list[MessageHandler]] = defaultdict(list)
        self._cleanup_task: Optional[asyncio.Task[None]] = None

    def register_handler(self, event_type: str, handler: MessageHandler) -> None:
        """Register a handler for a specific event type."""
        self._handlers[event_type].append(handler)
        logger.info(f"Registered handler for event type: {event_type}")

    def unregister_handler(self, event_type: str, handler: MessageHandler) -> None:
        """Unregister a handler for a specific event type."""
        handlers = self._handlers.get(event_type)
        if handlers and handler in handlers:
            handlers.remove(handler)
            if not handlers:
                del self._handlers[event_type]

    async def receive_message(self, dto: CreateInboxMessageDto) -> None:
        """Receive and process a message with automatic deduplication."""
        result = await self.repository.record(dto)

        if result.is_duplicate:
            self.emit(InboxEvents.MESSAGE_DUPLICATE, result.message)
            raise DuplicateMessageError(dto.message_id, dto.source)

        self.emit(InboxEvents.MESSAGE_RECEIVED, result.message)
        await self.process_message(result.message)

    async def process_message(self, message: InboxMessage) -> None:
        """Process a message using registered handlers."""
        handlers = self._handlers.get(message.event_type)

        if not handlers:
            # No handlers registered — mark as processed anyway
            await self.repository.mark_processed(message.id)
            self.emit(InboxEvents.MESSAGE_PROCESSED, message)
            return

        try:
            await self.repository.mark_processing(message.id)

            # Execute all handlers, collect results
            results = await asyncio.gather(
                *(handler(message) for handler in handlers),
                return_exceptions=True,
            )

            # Check if any handler failed
            failures = [r for r in results if isinstance(r, Exception)]
            if failures:
                raise failures[0]

            await self.repository.mark_processed(message.id)
            self.emit(InboxEvents.MESSAGE_PROCESSED, message)
        except Exception as e:
            await self._handle_processing_error(message, e)

    async def _handle_processing_error(self, message: InboxMessage, error: Exception) -> None:
        """Handle processing error with retry logic."""
        error_message = str(error)
        is_permanent = isinstance(error, ProcessingError)

        if message.retry_count >= message.max_retries or is_permanent:
            await self.repository.mark_failed(message.id, error_message, permanent=True)
            self.emit(InboxEvents.MESSAGE_FAILED, {
                "message": message, "error": error, "permanent": True,
            })
            if is_permanent:
                raise
            raise RuntimeError(
                f"Failed to process inbox message {message.id} "
                f"after {message.max_retries} retries: {error_message}"
            )

        # Calculate exponential backoff with jitter (only if retry is enabled)
        scheduled_at: Optional[datetime] = None
        if self.config.enable_retry:
            backoff_delay = self._calculate_backoff(message.retry_count)
            scheduled_at = datetime.now(timezone.utc) + timedelta(milliseconds=backoff_delay)

        await self.repository.mark_failed(
            message.id, error_message, permanent=False, scheduled_at=scheduled_at
        )
        self.emit(InboxEvents.MESSAGE_FAILED, {
            "message": message, "error": error, "permanent": False,
        })

        raise RuntimeError(f"Failed to process inbox message {message.id}: {error_message}")

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

    def start_cleanup(self) -> None:
        """Start cleanup timer for old messages."""
        if self._cleanup_task is not None:
            return
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    def stop_cleanup(self) -> None:
        """Stop cleanup timer."""
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            self._cleanup_task = None

    async def _cleanup_loop(self) -> None:
        """Cleanup loop — runs until cancelled."""
        await self._cleanup()
        while True:
            try:
                await asyncio.sleep(self.config.cleanup_interval)
                await self._cleanup()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in inbox cleanup: {e}", exc_info=True)
                self.emit("error", e)

    async def _cleanup(self) -> None:
        """Clean up old processed messages."""
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
