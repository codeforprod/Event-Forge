# Event-Forge (Python)

Python implementation of the Universal Inbox-Outbox Pattern for reliable message delivery in distributed systems.

## Installation

```bash
# Core only (Pydantic models, interfaces, services)
pip install event-forge

# With PostgreSQL support (SQLAlchemy async)
pip install event-forge[postgresql]

# With MongoDB support (Motor async)
pip install event-forge[mongodb]

# With RabbitMQ support (aio-pika)
pip install event-forge[rabbitmq]

# All extras
pip install event-forge[all]
```

## Requirements

- Python >=3.10
- Pydantic >= 2.0

## Quick Start

### PostgreSQL + SQLAlchemy

```python
from event_forge import OutboxService, CreateOutboxMessageDto, OutboxConfig
from event_forge.repositories.sqlalchemy import (
    SQLAlchemyOutboxRepository,
    Base,
)
from event_forge.publishers.aio_pika_publisher import AioPikaPublisher
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Setup database
engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")
session_factory = async_sessionmaker(engine, expire_on_commit=False)

# Create tables
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

# Setup repository and publisher
repository = SQLAlchemyOutboxRepository(session_factory)
publisher = AioPikaPublisher(
    url="amqp://guest:guest@localhost/",
    exchange_name="events",
)

# Create service
outbox = OutboxService(
    repository=repository,
    publisher=publisher,
    config=OutboxConfig(polling_interval=1.0, batch_size=10),
)

# Connect publisher and start polling
await publisher.connect()
outbox.start_polling()

# Create message in transaction
async def create_user_event(session):
    dto = CreateOutboxMessageDto(
        aggregate_type="User",
        aggregate_id="user-123",
        event_type="user.created",
        payload={"email": "user@example.com", "name": "John Doe"},
    )
    return await outbox.create_message(dto, session)

await outbox.with_transaction(create_user_event)
```

### Fire-and-Forget Client

```python
from event_forge import EventForgeAgentClient, OutboxConfig
from event_forge.repositories.sqlalchemy import SQLAlchemyOutboxRepository
from event_forge.publishers.aio_pika_publisher import AioPikaPublisher

client = EventForgeAgentClient(
    repository=SQLAlchemyOutboxRepository(session_factory),
    publisher=AioPikaPublisher(url="amqp://localhost/", exchange_name="events"),
)

await client.start()

# Fire-and-forget
await client.fire(
    aggregate_type="Call",
    aggregate_id="call-123",
    event_type="call.completed",
    payload={"duration": 120, "status": "success"},
)

await client.stop()
```

### Inbox Pattern

```python
from event_forge import InboxService, CreateInboxMessageDto, InboxConfig
from event_forge.repositories.sqlalchemy import SQLAlchemyInboxRepository

# Setup
repository = SQLAlchemyInboxRepository(session_factory)
inbox = InboxService(
    repository=repository,
    config=InboxConfig(enable_retry=True),
)

# Register handler
async def handle_order(message):
    print(f"Processing order: {message.payload}")

inbox.register_handler("order.placed", handle_order)

# Process incoming message (with automatic deduplication)
dto = CreateInboxMessageDto(
    message_id="ext-msg-123",
    source="external-system",
    event_type="order.placed",
    payload={"order_id": "order-456", "amount": 99.99},
)

await inbox.receive_message(dto)

# Start retry polling for failed messages
inbox.start_retry_polling()
```

### MongoDB + Motor

```python
from event_forge import OutboxService, InboxService, OutboxConfig, InboxConfig
from event_forge.repositories.motor import MotorOutboxRepository, MotorInboxRepository
from event_forge.publishers.aio_pika_publisher import AioPikaPublisher
from motor.motor_asyncio import AsyncIOMotorClient

# Setup MongoDB
client = AsyncIOMotorClient("mongodb://localhost:27017")

# Outbox repository
outbox_repo = MotorOutboxRepository(client, database="mydb")
await outbox_repo.ensure_indexes()

# Inbox repository
inbox_repo = MotorInboxRepository(client["mydb"])
await inbox_repo.ensure_indexes()

# Create services
outbox = OutboxService(
    repository=outbox_repo,
    publisher=AioPikaPublisher(url="amqp://localhost/", exchange_name="events"),
    config=OutboxConfig(polling_interval=1.0),
)

inbox = InboxService(
    repository=inbox_repo,
    config=InboxConfig(enable_retry=True),
)
```

### RabbitMQ Consumer

```python
from event_forge.consumers import AioPikaConsumer

consumer = AioPikaConsumer(
    url="amqp://guest:guest@localhost/",
    inbox_service=inbox,
    queue_name="my-service-inbox",
    exchange_name="events",
    routing_keys=["Order.*", "User.*"],
)

await consumer.start()
```

## Architecture

Matches the TypeScript implementation with full wire format compatibility:

- **Models**: Pydantic v2 models (type-safe DTOs)
- **Repositories**: SQLAlchemy async for PostgreSQL, Motor async for MongoDB
- **Services**: `OutboxService`, `InboxService` with exponential backoff and event emission
- **Publishers**: `AioPikaPublisher` for RabbitMQ (connect_robust, auto-reconnect)
- **Consumers**: `AioPikaConsumer` with inbox recording and deduplication
- **Client**: `EventForgeAgentClient` fire-and-forget facade

## Features

- **Transactional Guarantees** — Messages created in same transaction as business logic
- **Automatic Retry** — Exponential backoff with jitter for failed publishes
- **Duplicate Detection** — Inbox pattern prevents duplicate processing
- **Database Agnostic** — PostgreSQL (SQLAlchemy) and MongoDB (Motor) adapters
- **Async/Await** — Full async support with SQLAlchemy 2.0 and Motor
- **Type Safety** — Pydantic v2 models for validation
- **Wire Format Compatible** — camelCase JSON body, AMQP headers match Node.js publisher
- **Auto-Reconnect** — aio-pika connect_robust for RabbitMQ resilience
- **Event Emission** — SimpleEventEmitter for lifecycle hooks

## Node.js Compatibility

For TypeScript/JavaScript projects, use the NPM packages:
- `@prodforcode/event-forge-core`
- `@prodforcode/event-forge-typeorm`
- `@prodforcode/event-forge-mongoose`
- `@prodforcode/event-forge-rabbitmq-publisher`
- `@prodforcode/event-forge-nestjs`

## Documentation

For full documentation, see the [main README](../../README_INBOX_OUTBOX.md).

## License

MIT
