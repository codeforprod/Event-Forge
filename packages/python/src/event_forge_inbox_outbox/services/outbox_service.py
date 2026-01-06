import asyncio, logging
from datetime import datetime, timedelta
from typing import Any
from ..models import CreateOutboxMessageDto, OutboxMessage
from ..repositories.interfaces import IOutboxRepository

logger = logging.getLogger(__name__)

class OutboxService:
    def __init__(self, repository: IOutboxRepository, publisher: Any | None = None, polling_interval: float = 1.0, batch_size: int = 10):
        self.repository = repository; self.publisher = publisher; self.polling_interval = polling_interval
        self.batch_size = batch_size; self._polling_task = None; self._shutdown = False
    async def create_message(self, dto: CreateOutboxMessageDto, transaction_context: Any | None = None) -> OutboxMessage:
        return await self.repository.create(dto, transaction_context)
    async def start_polling(self):
        if self._polling_task: return
        self._shutdown = False; self._polling_task = asyncio.create_task(self._poll_loop()); logger.info("Outbox polling started")
    async def stop_polling(self):
        self._shutdown = True
        if self._polling_task: self._polling_task.cancel(); 
        try: await self._polling_task
        except asyncio.CancelledError: pass
        self._polling_task = None; logger.info("Outbox polling stopped")
    async def _poll_loop(self):
        while not self._shutdown:
            try: await self._process_batch()
            except Exception as e: logger.error(f"Error in polling loop: {e}", exc_info=True)
            await asyncio.sleep(self.polling_interval)
    async def _process_batch(self):
        if not self.publisher: return
        locker_id = f"outbox-service-{id(self)}"; messages = await self.repository.fetch_and_lock_pending(self.batch_size, locker_id)
        for message in messages:
            try: await self.publisher.publish(message); await self.repository.mark_published(message.id); logger.info(f"Published message {message.id}")
            except Exception as e: logger.error(f"Failed to publish message {message.id}: {e}"); await self.repository.mark_failed(message.id, str(e))
    async def cleanup_old_messages(self, older_than_days: int = 30) -> int:
        cutoff_date = datetime.utcnow() - timedelta(days=older_than_days); return await self.repository.delete_older_than(cutoff_date)
