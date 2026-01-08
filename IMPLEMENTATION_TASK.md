# Jira Task: Universal Inbox-Outbox Library

## Epic: Shared Infrastructure Libraries

---

## Task: LIB-XXX - Create Universal Inbox-Outbox Library

### Summary
Create a database-agnostic, pluggable library implementing the Transactional Inbox-Outbox pattern for reliable message delivery. Supports PostgreSQL (TypeORM), MongoDB (Mongoose), and Python (SQLAlchemy).

### Priority: High
### Type: New Feature / Infrastructure
### Estimate: 3-4 weeks
### Labels: `library`, `infrastructure`, `npm`, `pypi`, `rabbitmq`

---

## Target Projects

| Project | Database | Adapter Needed |
|---------|----------|----------------|
| event-forge Backend | PostgreSQL + TypeORM | `@prodforcode/event-forge-typeorm` |
| event-forge Agent | PostgreSQL + SQLAlchemy | `event-forge-inbox-outbox` (Python) |
| Holocron | MongoDB + Mongoose | `@prodforcode/event-forge-mongoose` |
| Future projects | Any | Pluggable adapters |

---

## Acceptance Criteria

### AC1: Core Package (`@prodforcode/event-forge-core`)

**Interfaces:**
- [ ] `IOutboxRepository` - create, fetchAndLockPending, markPublished, markFailed, withTransaction
- [ ] `IInboxRepository` - record, exists, markProcessing, markProcessed, markFailed
- [ ] `IMessagePublisher` - publish(message, options)

**Services:**
- [ ] `OutboxService` - polling + EventEmitter hybrid, createMessage(), withTransaction()
- [ ] `InboxService` - handler registration, processMessage(), deduplication

**Decorators:**
- [ ] `@OutboxHandler(eventType, options)` - Cron + OnEvent
- [ ] `@InboxHandler(eventType, options)` - Cron + OnEvent

**Errors:**
- [ ] `ProcessingError` - permanent failure (no retries)

### AC2: TypeORM Adapter (`@prodforcode/event-forge-typeorm`)

- [ ] `OutboxMessageEntity` - TypeORM entity with indexes
- [ ] `InboxMessageEntity` - TypeORM entity with unique constraint
- [ ] `TypeOrmOutboxRepository` - implements IOutboxRepository with `SKIP LOCKED`
- [ ] `TypeOrmInboxRepository` - implements IInboxRepository
- [ ] PostgreSQL migrations in `spec/migrations/postgresql/`

### AC3: Mongoose Adapter (`@prodforcode/event-forge-mongoose`)

- [ ] `OutboxMessageSchema` - Mongoose schema compatible with message-relay
- [ ] `InboxMessageSchema` - Mongoose schema
- [ ] `MongooseOutboxRepository` - implements IOutboxRepository with findOneAndUpdate
- [ ] `MongooseInboxRepository` - implements IInboxRepository
- [ ] MongoDB indexes in `spec/migrations/mongodb/`

### AC4: RabbitMQ Publisher (`@prodforcode/event-forge-rabbitmq`)

- [ ] `GolevelupPublisher` - for @golevelup/nestjs-rabbitmq (event-forge style)
- [ ] `MicroservicesPublisher` - for @nestjs/microservices (Holocron style)

### AC5: NestJS Module (`@prodforcode/event-forge-nestjs`)

- [ ] `InboxOutboxModule.forRoot(options)` - sync configuration
- [ ] `InboxOutboxModule.forRootAsync(options)` - async configuration
- [ ] Proper DI token exports

### AC6: Python Package (`event-forge-inbox-outbox`)

- [ ] Pydantic models matching JSON Schema
- [ ] SQLAlchemy entities for PostgreSQL
- [ ] Motor adapter for MongoDB (optional)
- [ ] `OutboxService` with async/await
- [ ] `InboxService` with handler registration
- [ ] `AioPikaPublisher` for RabbitMQ

### AC7: Testing & Documentation

- [ ] Unit tests for core services (>80% coverage)
- [ ] Integration tests with testcontainers (PostgreSQL, MongoDB, RabbitMQ)
- [ ] README with installation and usage examples
- [ ] Migration guide from `@aaa-gth/message-relay`

---

## Technical Design

### Package Structure

```
inbox-outbox/
├── spec/
│   ├── schemas/              # JSON Schema (source of truth)
│   └── migrations/           # PostgreSQL + MongoDB
├── packages/
│   ├── core/                 # @prodforcode/event-forge-core
│   ├── adapter-typeorm/      # @prodforcode/event-forge-typeorm
│   ├── adapter-mongoose/     # @prodforcode/event-forge-mongoose
│   ├── publisher-rabbitmq/   # @prodforcode/event-forge-rabbitmq
│   ├── nestjs/               # @prodforcode/event-forge-nestjs
│   └── python/               # event-forge-inbox-outbox (PyPI)
└── examples/
```

### Core Interface (IOutboxRepository)

```typescript
interface IOutboxRepository {
  create(dto: CreateOutboxMessageDto, context?: unknown): Promise<OutboxMessage>;
  fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
  withTransaction<T>(operation: (ctx: unknown) => Promise<T>): Promise<T>;
}
```

### Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Business Logic + createMessage() in transaction         │
│  2. Commit → EventEmitter.emit('outbox:created')           │
│  3. Immediate: OutboxService.processMessage(id)             │
│  4. Fallback: Cron polling every 1s                         │
│  5. Publish to RabbitMQ via IMessagePublisher               │
│  6. Mark published or retry with exponential backoff        │
└─────────────────────────────────────────────────────────────┘
```

---

## Subtasks

### ST1: Monorepo Setup (1 day)
- Initialize lerna/turborepo monorepo
- Configure TypeScript, ESLint, Jest
- Setup GitHub Actions CI/CD
- Configure NPM publishing

### ST2: Core Package (3 days)
- Interfaces (IOutboxRepository, IInboxRepository, IMessagePublisher)
- OutboxService with EventEmitter + polling
- InboxService with handler registration
- Decorators (@OutboxHandler, @InboxHandler)
- ProcessingError class
- Unit tests

### ST3: TypeORM Adapter (2 days)
- TypeORM entities
- PostgreSQL repository implementations
- SQL migrations
- Integration tests with testcontainers

### ST4: Mongoose Adapter (2 days)
- Mongoose schemas (compatible with message-relay)
- MongoDB repository implementations
- Indexes configuration
- Integration tests

### ST5: RabbitMQ Publishers (1 day)
- Golevelup publisher
- Microservices publisher
- Unit tests

### ST6: NestJS Module (1 day)
- Dynamic module with forRoot/forRootAsync
- DI configuration
- Integration tests

### ST7: Python Package (3 days)
- Pydantic models
- SQLAlchemy repositories
- Async OutboxService/InboxService
- AioPika publisher
- Unit tests

### ST8: Documentation (1 day)
- README with examples
- API documentation
- Migration guide from message-relay

### ST9: event-forge Integration (2 days)
- Install in Callevent-forge-Backend
- Install in Callevent-forge-Agent
- E2E tests

### ST10: Holocron Integration (1 day)
- Install in Holocron-Backend
- Verify MongoDB adapter
- E2E tests

---

## Usage Examples

### event-forge Backend

```typescript
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { TypeOrmOutboxRepository } from '@prodforcode/event-forge-typeorm';
import { GolevelupPublisher } from '@prodforcode/event-forge-rabbitmq';

@Module({
  imports: [
    InboxOutboxModule.forRoot({
      outboxRepository: { provide: OUTBOX_REPOSITORY, useClass: TypeOrmOutboxRepository },
      inboxRepository: { provide: INBOX_REPOSITORY, useClass: TypeOrmInboxRepository },
      messagePublisher: { provide: MESSAGE_PUBLISHER, useClass: GolevelupPublisher },
    }),
  ],
})
export class AppModule {}
```

### Holocron

```typescript
import { MongooseOutboxRepository } from '@prodforcode/event-forge-mongoose';
import { MicroservicesPublisher } from '@prodforcode/event-forge-rabbitmq';

@Module({
  imports: [
    InboxOutboxModule.forRoot({
      outboxRepository: { provide: OUTBOX_REPOSITORY, useClass: MongooseOutboxRepository },
      inboxRepository: { provide: INBOX_REPOSITORY, useClass: MongooseInboxRepository },
      messagePublisher: { provide: MESSAGE_PUBLISHER, useClass: MicroservicesPublisher },
    }),
  ],
})
export class AppModule {}
```

### Python Agent

```python
from event-forge_inbox_outbox import OutboxService
from event-forge_inbox_outbox.adapters.sqlalchemy import SQLAlchemyOutboxRepository
from event-forge_inbox_outbox.publishers.aio_pika import AioPikaPublisher

outbox_service = OutboxService(
    repository=SQLAlchemyOutboxRepository(engine),
    publisher=AioPikaPublisher(connection, exchange='event-forge.events'),
)

async with outbox_service.transaction() as session:
    await outbox_service.create_message(dto, session)
```

---

## Definition of Done

- [ ] All AC met
- [ ] Unit test coverage >80%
- [ ] Integration tests passing
- [ ] NPM packages published (`@prodforcode/event-forge-*`)
- [ ] PyPI package published (`event-forge-inbox-outbox`)
- [ ] event-forge Backend using library
- [ ] event-forge Agent using library
- [ ] Holocron using library
- [ ] No messages lost during service restarts
- [ ] Documentation complete

---

## NPM Scope Decision

**Option A**: `@prodforcode/event-forge-*` (personal scope)
**Option B**: `@prodforcode/event-forge-*` (project scope)
**Option C**: `inbox-outbox-universal` (no scope)

**Recommendation**: `@prodforcode/event-forge-*` for personal reusable libraries.

---

## Related

- Analysis document: `universal-inbox-outbox-design.md`
- Reference implementation: `@aaa-gth/message-relay`
- Parent Epic: Shared Infrastructure Libraries
