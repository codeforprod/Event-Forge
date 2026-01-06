# Event-Forge: Universal Inbox-Outbox Pattern Library

A comprehensive, framework-agnostic implementation of the Transactional Inbox-Outbox pattern for reliable message delivery in distributed systems. Available for both **Node.js/TypeScript** and **Python**.

## 🎯 Overview

The Inbox-Outbox pattern ensures reliable message delivery in distributed systems by:

- **Outbox Pattern**: Guarantees message publishing by storing outgoing messages in the same transaction as business logic
- **Inbox Pattern**: Prevents duplicate message processing through deduplication
- **Transactional Guarantees**: Ensures atomicity between database operations and message creation
- **Automatic Retry**: Exponential backoff for failed message deliveries
- **Polling & Cleanup**: Background workers for message processing and cleanup

## 📦 Packages

### Node.js / TypeScript

| Package | Description | NPM |
|---------|-------------|-----|
| `@event-forge/inbox-outbox-core` | Core services and interfaces | [![npm](https://img.shields.io/npm/v/@event-forge/inbox-outbox-core.svg)](https://www.npmjs.com/package/@event-forge/inbox-outbox-core) |
| `@event-forge/inbox-outbox-typeorm` | TypeORM adapter for PostgreSQL/MySQL | [![npm](https://img.shields.io/npm/v/@event-forge/inbox-outbox-typeorm.svg)](https://www.npmjs.com/package/@event-forge/inbox-outbox-typeorm) |
| `@event-forge/inbox-outbox-mongoose` | Mongoose adapter for MongoDB | [![npm](https://img.shields.io/npm/v/@event-forge/inbox-outbox-mongoose.svg)](https://www.npmjs.com/package/@event-forge/inbox-outbox-mongoose) |
| `@event-forge/inbox-outbox-rabbitmq` | RabbitMQ publisher | [![npm](https://img.shields.io/npm/v/@event-forge/inbox-outbox-rabbitmq.svg)](https://www.npmjs.com/package/@event-forge/inbox-outbox-rabbitmq) |
| `@event-forge/inbox-outbox-nestjs` | NestJS integration module | [![npm](https://img.shields.io/npm/v/@event-forge/inbox-outbox-nestjs.svg)](https://www.npmjs.com/package/@event-forge/inbox-outbox-nestjs) |

### Python

| Package | Description | PyPI |
|---------|-------------|------|
| `event-forge-inbox-outbox` | Complete Python implementation with SQLAlchemy & MongoDB support | [![PyPI](https://img.shields.io/pypi/v/event-forge-inbox-outbox.svg)](https://pypi.org/project/event-forge-inbox-outbox/) |

## 🚀 Quick Start

### NestJS Application

#### 1. Installation

```bash
npm install @event-forge/inbox-outbox-core @event-forge/inbox-outbox-nestjs @event-forge/inbox-outbox-typeorm @event-forge/inbox-outbox-rabbitmq
```

#### 2. Setup Module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxOutboxModule } from '@event-forge/inbox-outbox-nestjs';
import { TypeOrmOutboxRepository, TypeOrmInboxRepository } from '@event-forge/inbox-outbox-typeorm';
import { RabbitMQPublisher } from '@event-forge/inbox-outbox-rabbitmq';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'password',
      database: 'mydb',
      entities: [/* your entities */],
      synchronize: false, // Use migrations in production
    }),
    InboxOutboxModule.register({
      outbox: {
        repository: TypeOrmOutboxRepository,
        config: {
          pollingInterval: 5000, // Poll every 5 seconds
          batchSize: 10,
          maxRetries: 3,
          retentionDays: 7,
        },
      },
      inbox: {
        repository: TypeOrmInboxRepository,
        config: {
          retentionDays: 30,
        },
      },
      publisher: RabbitMQPublisher,
    }),
  ],
})
export class AppModule {}
```

#### 3. Use in Service

```typescript
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxService } from '@event-forge/inbox-outbox-core';

@Injectable()
export class UserService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private outboxService: OutboxService,
  ) {}

  async createUser(email: string, name: string) {
    // Use transaction to ensure atomicity
    return this.outboxService.withTransaction(async (transactionContext) => {
      // 1. Save user to database within transaction
      const user = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('users')
        .values({ email, name })
        .execute();

      // 2. Create outbox message in same transaction
      await this.outboxService.createMessage(
        {
          aggregateType: 'User',
          aggregateId: user.identifiers[0].id,
          eventType: 'user.created',
          payload: { email, name },
        },
        transactionContext, // Pass transaction context
      );

      return user;
    });
    // Message will be published automatically after commit
  }
}
```

#### 4. Configure RabbitMQ Publisher

```typescript
import { RabbitMQPublisher } from '@event-forge/inbox-outbox-rabbitmq';

const publisher = new RabbitMQPublisher({
  url: 'amqp://guest:guest@localhost:5672',
  exchange: 'events',
  exchangeType: 'topic',
});

await publisher.connect();
```

#### 5. Handle Incoming Messages (Inbox)

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InboxService } from '@event-forge/inbox-outbox-core';

@Injectable()
export class OrderEventHandler implements OnModuleInit {
  constructor(private inboxService: InboxService) {}

  onModuleInit() {
    // Register handler for order events
    this.inboxService.registerHandler('order.placed', async (message) => {
      console.log('Processing order:', message.payload);
      // Your business logic here
    });
  }

  async handleIncomingMessage(externalMessage: any) {
    // Process incoming message with automatic deduplication
    await this.inboxService.receiveMessage({
      messageId: externalMessage.id, // External message ID for deduplication
      source: 'external-service',
      eventType: 'order.placed',
      payload: externalMessage.data,
    });
    // Message will be processed only once, even if received multiple times
  }
}
```

#### 6. Start Background Polling

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OutboxService, InboxService } from '@event-forge/inbox-outbox-core';

@Injectable()
export class OutboxPollingService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private outboxService: OutboxService,
    private inboxService: InboxService,
  ) {}

  async onModuleInit() {
    // Start polling for pending outbox messages
    await this.outboxService.startPolling();

    // Start cleanup for old messages
    await this.outboxService.cleanup();
    await this.inboxService.cleanup();
  }

  async onModuleDestroy() {
    // Stop polling on shutdown
    await this.outboxService.stopPolling();
  }
}
```

### Python Application

#### 1. Installation

```bash
# With PostgreSQL support
pip install event-forge-inbox-outbox

# With RabbitMQ support
pip install event-forge-inbox-outbox[rabbitmq]

# With MongoDB support
pip install event-forge-inbox-outbox[mongodb]

# All extras
pip install event-forge-inbox-outbox[rabbitmq,mongodb]
```

#### 2. Setup with SQLAlchemy (PostgreSQL)

```python
from event_forge_inbox_outbox import OutboxService, CreateOutboxMessageDto
from event_forge_inbox_outbox.repositories.sqlalchemy import (
    SQLAlchemyOutboxRepository,
    Base,
)
from event_forge_inbox_outbox.publishers.aio_pika import AioPikaPublisher
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Setup database
engine = create_async_engine(
    "postgresql+asyncpg://user:password@localhost/mydb",
    echo=True,
)

# Create tables (use Alembic migrations in production)
async with engine.begin() as conn:
    await conn.run_sync(Base.metadata.create_all)

# Setup repository and publisher
outbox_repository = SQLAlchemyOutboxRepository(engine)
publisher = AioPikaPublisher(
    url="amqp://guest:guest@localhost/",
    exchange="events",
    exchange_type="topic",
)

# Create service
outbox_service = OutboxService(
    repository=outbox_repository,
    publisher=publisher,
)
```

#### 3. Use in Application

```python
from sqlalchemy.ext.asyncio import AsyncSession

async def create_user(email: str, name: str):
    """Create user with reliable message publishing"""

    # Create session with transaction
    async with AsyncSession(engine) as session:
        async with session.begin():
            # 1. Insert user into database
            result = await session.execute(
                "INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id",
                {"email": email, "name": name}
            )
            user_id = result.scalar_one()

            # 2. Create outbox message in same transaction
            dto = CreateOutboxMessageDto(
                aggregate_type="User",
                aggregate_id=str(user_id),
                event_type="user.created",
                payload={"email": email, "name": name},
            )
            await outbox_service.create_message(dto, session)

        # Transaction commits here
        # Message will be published automatically after commit
```

#### 4. Handle Incoming Messages (Inbox)

```python
from event_forge_inbox_outbox import InboxService, CreateInboxMessageDto
from event_forge_inbox_outbox.repositories.sqlalchemy import SQLAlchemyInboxRepository

# Setup inbox
inbox_repository = SQLAlchemyInboxRepository(engine)
inbox_service = InboxService(repository=inbox_repository)

# Register event handler
@inbox_service.register_handler("order.placed")
async def handle_order_placed(message):
    print(f"Processing order: {message.payload}")
    # Your business logic here

# Process incoming message with automatic deduplication
async def handle_external_message(external_msg: dict):
    dto = CreateInboxMessageDto(
        message_id=external_msg["id"],  # External message ID for deduplication
        source="external-service",
        event_type="order.placed",
        payload=external_msg["data"],
    )

    # Will process only once, even if message is received multiple times
    await inbox_service.receive_message(dto)
```

#### 5. Start Background Workers

```python
import asyncio

async def start_background_workers():
    """Start polling and cleanup workers"""

    # Start outbox polling (retries failed messages)
    await outbox_service.start_polling()

    # Start cleanup workers (removes old processed messages)
    cleanup_task = asyncio.create_task(run_periodic_cleanup())

    # Keep running
    await asyncio.Event().wait()

async def run_periodic_cleanup():
    """Periodic cleanup of old messages"""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        await outbox_service.cleanup()
        await inbox_service.cleanup()

# Run application
asyncio.run(start_background_workers())
```

## 🏗️ Architecture

### Core Concepts

#### Outbox Pattern
1. **Create Message in Transaction**: Outbox message is created in the same database transaction as business data
2. **Immediate Publish Attempt**: After commit, immediate attempt to publish the message
3. **Polling for Retries**: Background poller picks up failed messages and retries with exponential backoff
4. **Cleanup**: Old published messages are periodically deleted

#### Inbox Pattern
1. **Receive Message**: External message is recorded with unique message ID
2. **Deduplication Check**: If message ID already exists, skip processing
3. **Handler Execution**: Registered handlers are called for the event type
4. **Mark as Processed**: Message status is updated to prevent reprocessing
5. **Cleanup**: Old processed messages are periodically deleted

### Message States

#### Outbox Message States
- `pending` - Created, waiting to be published
- `publishing` - Currently being published (locked)
- `published` - Successfully published
- `failed` - Permanently failed (max retries exceeded)

#### Inbox Message States
- `received` - Message received, waiting to be processed
- `processing` - Currently being processed
- `processed` - Successfully processed
- `failed` - Processing failed

## 📊 Database Schema

### Outbox Messages Table

```sql
CREATE TABLE outbox_messages (
  id VARCHAR(36) PRIMARY KEY,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  locked_by VARCHAR(255),
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);

CREATE INDEX idx_outbox_status ON outbox_messages(status);
CREATE INDEX idx_outbox_aggregate ON outbox_messages(aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_created ON outbox_messages(created_at);
```

### Inbox Messages Table

```sql
CREATE TABLE inbox_messages (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  source VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE UNIQUE INDEX idx_inbox_message_id ON inbox_messages(message_id);
CREATE INDEX idx_inbox_status ON inbox_messages(status);
CREATE INDEX idx_inbox_created ON inbox_messages(created_at);
```

## ⚙️ Configuration Options

### Outbox Configuration

```typescript
{
  pollingInterval: 5000,      // Polling interval in ms (default: 5000)
  batchSize: 10,              // Number of messages to process per batch (default: 10)
  maxRetries: 3,              // Maximum retry attempts (default: 3)
  retryDelay: 1000,           // Initial retry delay in ms (default: 1000)
  retryBackoffMultiplier: 2,  // Exponential backoff multiplier (default: 2)
  lockTimeout: 30000,         // Message lock timeout in ms (default: 30000)
  retentionDays: 7,           // Days to keep published messages (default: 7)
  immediateProcessing: true,  // Attempt immediate publish after commit (default: true)
}
```

### Inbox Configuration

```typescript
{
  retentionDays: 30,  // Days to keep processed messages (default: 30)
}
```

## 🔧 Advanced Usage

### Custom Publishers

Implement the `IMessagePublisher` interface:

```typescript
import { IMessagePublisher, OutboxMessage } from '@event-forge/inbox-outbox-core';

export class CustomPublisher implements IMessagePublisher {
  async publish(message: OutboxMessage): Promise<void> {
    // Your custom publishing logic
    await fetch('https://api.example.com/events', {
      method: 'POST',
      body: JSON.stringify({
        type: message.eventType,
        data: message.payload,
      }),
    });
  }

  async connect(): Promise<void> {
    // Setup connection if needed
  }

  async disconnect(): Promise<void> {
    // Cleanup connection
  }
}
```

### Custom Repositories

Implement `IOutboxRepository` or `IInboxRepository`:

```typescript
import { IOutboxRepository, OutboxMessage } from '@event-forge/inbox-outbox-core';

export class CustomOutboxRepository implements IOutboxRepository {
  async create(message: OutboxMessage, transactionContext?: any): Promise<OutboxMessage> {
    // Save to your custom database
  }

  async findPendingMessages(limit: number): Promise<OutboxMessage[]> {
    // Query pending messages
  }

  // Implement other required methods...
}
```

### Event Listeners

Subscribe to internal events:

```typescript
import { OutboxService, OutboxEvent } from '@event-forge/inbox-outbox-core';

outboxService.on(OutboxEvent.MESSAGE_CREATED, (message) => {
  console.log('Message created:', message.id);
});

outboxService.on(OutboxEvent.MESSAGE_PUBLISHED, (message) => {
  console.log('Message published:', message.id);
});

outboxService.on(OutboxEvent.PUBLISH_FAILED, ({ message, error }) => {
  console.error('Publish failed:', message.id, error);
});
```

## 🧪 Testing

### Unit Tests

```bash
# Node.js
npm test

# Python
pytest
```

### Integration Tests

```bash
# Requires running PostgreSQL and RabbitMQ
docker-compose up -d
npm run test:integration
```

## 📚 API Reference

### OutboxService

- `createMessage(dto, transactionContext?)` - Create outbox message
- `withTransaction(callback)` - Execute operation within transaction
- `startPolling()` - Start background polling
- `stopPolling()` - Stop background polling
- `cleanup()` - Remove old published messages

### InboxService

- `receiveMessage(dto)` - Receive and process message with deduplication
- `registerHandler(eventType, handler)` - Register event handler
- `unregisterHandler(eventType, handler)` - Unregister event handler
- `cleanup()` - Remove old processed messages

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- [Documentation](https://event-forge.dev)
- [GitHub Repository](https://github.com/event-forge/inbox-outbox)
- [Issue Tracker](https://github.com/event-forge/inbox-outbox/issues)

## 💡 Related Patterns

- [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Polling Publisher](https://microservices.io/patterns/data/polling-publisher.html)
- [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html)

## 📖 Further Reading

- [Reliable Microservices Data Exchange With the Outbox Pattern](https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/)
- [Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Implementing the Outbox Pattern](https://www.kamilgrzybek.com/design/implementing-the-outbox-pattern/)
