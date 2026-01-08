# Event-Forge Inbox-Outbox (Python)

Python implementation of the Universal Inbox-Outbox Pattern for reliable message delivery in distributed systems.

## Installation

```bash
pip install callairis-event-forge
```

With RabbitMQ support:
```bash
pip install callairis-event-forge[rabbitmq]
```

With MongoDB support:
```bash
pip install callairis-event-forge[mongodb]
```

## Requirements

- Python >=3.10
- SQLAlchemy >= 2.0 (async support)
- Pydantic >= 2.0

## Quick Start

### PostgreSQL + SQLAlchemy

```python
from callairis_event_forge import OutboxService, CreateOutboxMessageDto
from callairis_event_forge.repositories.sqlalchemy import (
    SQLAlchemyOutboxRepository,
    Base,
)
from callairis_event_forge.publishers.aio_pika import AioPikaPublisher
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

# Setup database
engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")

# Create tables
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

# Setup repository and publisher
repository = SQLAlchemyOutboxRepository(engine)
publisher = AioPikaPublisher(url="amqp://guest:guest@localhost/")

# Create service
outbox = OutboxService(repository=repository, publisher=publisher)

# Create message in transaction
async with AsyncSession(engine) as session:
    async with session.begin():
        dto = CreateOutboxMessageDto(
            aggregate_type="User",
            aggregate_id="user-123",
            event_type="user.created",
            payload={"email": "user@example.com", "name": "John Doe"},
        )
        await outbox.create_message(dto, session)
    # Commit triggers immediate publish attempt

# Start background polling for retries
await outbox.start_polling()
```

### Inbox Pattern

```python
from callairis_event_forge import InboxService, CreateInboxMessageDto
from callairis_event_forge.repositories.sqlalchemy import SQLAlchemyInboxRepository

# Setup
repository = SQLAlchemyInboxRepository(engine)
inbox = InboxService(repository=repository)

# Register handler
@inbox.register_handler("order.placed")
async def handle_order_placed(message):
    print(f"Processing order: {message.payload}")

# Process incoming message (with automatic deduplication)
dto = CreateInboxMessageDto(
    message_id="ext-msg-123",
    source="external-system",
    event_type="order.placed",
    payload={"order_id": "order-456", "amount": 99.99},
)

await inbox.process_message(dto)  # Calls handler, marks as processed
```

## Architecture

Matches the TypeScript implementation:

- **Models**: Pydantic models (type-safe DTOs)
- **Repositories**: SQLAlchemy for PostgreSQL, Motor for MongoDB (optional)
- **Services**: `OutboxService`, `InboxService` with async/await
- **Publishers**: `AioPikaPublisher` for RabbitMQ

## Features

✅ **Transactional Guarantees** - Messages created in same transaction as business logic
✅ **Automatic Retry** - Exponential backoff for failed publishes
✅ **Duplicate Detection** - Inbox pattern prevents duplicate processing
✅ **Async/Await** - Full async support with SQLAlchemy 2.0
✅ **Type Safety** - Pydantic models for validation
✅ **Database Agnostic** - Pluggable repositories (SQLAlchemy, Motor)
✅ **Message Broker Agnostic** - Pluggable publishers (RabbitMQ, custom)

## Target Use Case

Designed for **Event-Forge Agent** (Python service using SQLAlchemy + PostgreSQL).

For TypeScript/JavaScript projects, use the NPM packages:
- `@prodforcode/event-forge-core`
- `@prodforcode/event-forge-typeorm`
- `@prodforcode/event-forge-mongoose`

## Documentation

For full documentation, see the [main README](../../README_INBOX_OUTBOX.md).

## License

MIT
