# Event-Forge Inbox-Outbox (Python)

Python implementation of the Universal Inbox-Outbox Pattern for reliable message delivery.

## Installation

```bash
pip install event-forge-inbox-outbox
```

With RabbitMQ support:
```bash
pip install event-forge-inbox-outbox[rabbitmq]
```

## Requirements

- Python >=3.10
- SQLAlchemy >= 2.0 (for PostgreSQL)
- Pydantic >= 2.0

## Quick Start

### Using SQLAlchemy (PostgreSQL)

```python
from event_forge_inbox_outbox import OutboxService, CreateOutboxMessageDto
from event_forge_inbox_outbox.repositories.sqlalchemy import SQLAlchemyOutboxRepository
from event_forge_inbox_outbox.publishers.aio_pika import AioPikaPublisher
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

# Setup
engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")
repository = SQLAlchemyOutboxRepository(engine)
publisher = AioPikaPublisher(rabbitmq_url="amqp://guest:guest@localhost/")

# Create service
outbox_service = OutboxService(repository=repository, publisher=publisher)

# Create message in transaction
async with AsyncSession(engine) as session:
    async with session.begin():
        message_dto = CreateOutboxMessageDto(
            aggregate_type="User",
            aggregate_id="user-123",
            event_type="user.created",
            payload={"email": "user@example.com"},
        )
        await outbox_service.create_message(message_dto, session)
    # Commit triggers publish
```

## Architecture

Matches the TypeScript implementation:

- **Models**: Pydantic models (CreateOutboxMessageDto, OutboxMessage, etc.)
- **Repositories**: SQLAlchemy for PostgreSQL, Motor for MongoDB (optional)
- **Services**: OutboxService, InboxService with async/await
- **Publishers**: AioPikaPublisher for RabbitMQ

## Features

- ✅ Transactional Guarantees
- ✅ Automatic Retry with Exponential Backoff
- ✅ Duplicate Detection (Inbox)
- ✅ SQLAlchemy Support (PostgreSQL)
- ✅ Type Safety (Pydantic)
- ✅ Async/Await

## Status

**Current**: Alpha/Beta - Core functionality implemented
**Target**: Event-Forge Agent (Python service)

For full documentation, see the [main README](../../README_INBOX_OUTBOX.md).
