import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Awaitable, Callable
from ..errors import DuplicateMessageError, ProcessingError
from ..models import CreateInboxMessageDto, InboxMessage
from ..repositories.interfaces import IInboxRepository

logger = logging.getLogger(__name__)
MessageHandler = Callable[[InboxMessage], Awaitable[None]]

class InboxService:
    def __init__(self, repository: IInboxRepository):
        self.repository = repository; self._handlers: dict[str, list[MessageHandler]] = defaultdict(list)
    def register_handler(self, event_type: str, handler: MessageHandler):
        self._handlers[event_type].append(handler); logger.info(f"Registered handler for event type: {event_type}")
    async def process_message(self, dto: CreateInboxMessageDto) -> InboxMessage:
        result = await self.repository.record(dto)
        if result.is_duplicate: raise DuplicateMessageError(dto.message_id, dto.source)
        message = result.message; handlers = self._handlers.get(dto.event_type, [])
        if not handlers: logger.warning(f"No handlers registered for event type: {dto.event_type}"); await self.repository.mark_processed(message.id); return message
        await self.repository.mark_processing(message.id)
        try:
            for handler in handlers: await handler(message)
            await self.repository.mark_processed(message.id); logger.info(f"Successfully processed message {message.id}"); return message
        except ProcessingError as e: logger.error(f"Permanent failure processing message {message.id}: {e}"); await self.repository.mark_failed(message.id, str(e)); raise
        except Exception as e: logger.error(f"Failed to process message {message.id}: {e}", exc_info=True); await self.repository.mark_failed(message.id, str(e)); raise
    async def cleanup_old_messages(self, older_than_days: int = 30) -> int:
        cutoff_date = datetime.utcnow() - timedelta(days=older_than_days); return await self.repository.delete_older_than(cutoff_date)
