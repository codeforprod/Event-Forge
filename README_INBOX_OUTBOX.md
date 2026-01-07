# Universal Inbox-Outbox Library

A database-agnostic library implementing the Transactional Inbox-Outbox pattern for reliable message delivery.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    @callairis/event-forge (NPM)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  Core Layer (database-agnostic)                                         │
│  ├── Interfaces: IOutboxRepository, IInboxRepository                    │
│  ├── Services: OutboxService, InboxService                              │
│  ├── Decorators: @OutboxHandler, @InboxHandler                          │
│  └── Errors: ProcessingError, DuplicateMessageError                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Adapters (pluggable)                                                   │
│  ├── PostgreSQL (TypeORM)     → event-forge Backend                    │
│  ├── MongoDB (Mongoose)       → Holocron, Legacy projects               │
│  └── Custom                   → User-defined                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Publishers (pluggable)                                                 │
│  ├── RabbitMQ (@golevelup)    → Default                                 │
│  ├── RabbitMQ (microservices) → Holocron style                          │
│  └── Custom                   → Kafka, Redis Streams, etc.              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Packages

### 📦 Core Package (`@callairis/event-forge-core`)

Core interfaces, services, and business logic.

**Interfaces:**
- `IOutboxRepository` - Outbox message persistence
- `IInboxRepository` - Inbox message persistence
- `IMessagePublisher` - Message broker abstraction

**Services:**
- `OutboxService` - Polling + EventEmitter hybrid, message creation
- `InboxService` - Handler registration, deduplication

**Decorators:**
- `@OutboxHandler(options)` - Mark methods as outbox handlers
- `@InboxHandler(options)` - Mark methods as inbox handlers

**Errors:**
- `ProcessingError` - Permanent failure (no retries)
- `DuplicateMessageError` - Message already received

**Configuration:**
- `OutboxConfig` - Polling interval, batch size, retry logic
- `InboxConfig` - Cleanup settings

### 📦 TypeORM Adapter (`@callairis/event-forge-typeorm`)

PostgreSQL adapter using TypeORM.

**Entities:**
- `OutboxMessageEntity` - TypeORM entity with proper indexes
- `InboxMessageEntity` - TypeORM entity with unique constraint

**Repositories:**
- `TypeOrmOutboxRepository` - Implements `IOutboxRepository` with `SKIP LOCKED`
- `TypeOrmInboxRepository` - Implements `IInboxRepository` with deduplication

**Key Features:**
- Uses PostgreSQL `FOR UPDATE SKIP LOCKED` for concurrent processing
- Proper transaction support via `EntityManager`
- Optimized indexes for performance
- Automatic stale lock release

### 📦 Mongoose Adapter (`@callairis/event-forge-mongoose`)

MongoDB adapter using Mongoose.

**Schemas:**
- `OutboxMessageSchema` - Mongoose schema with indexes
- `InboxMessageSchema` - Mongoose schema with unique index

**Repositories:**
- `MongooseOutboxRepository` - Implements `IOutboxRepository` with `findOneAndUpdate`
- `MongooseInboxRepository` - Implements `IInboxRepository` with deduplication

**Key Features:**
- Atomic operations using `findOneAndUpdate`
- MongoDB-specific optimizations
- Compatible with existing message-relay systems

### 📦 RabbitMQ Publishers (`@callairis/event-forge-rabbitmq`)

RabbitMQ integration with two publisher implementations.

**Publishers:**
- `GolevelupPublisher` - For `@golevelup/nestjs-rabbitmq` (event-forge Backend style)
- `MicroservicesPublisher` - For `@nestjs/microservices` (Holocron style)

### 📦 NestJS Module (`@callairis/event-forge-nestjs`)

NestJS integration module.

**Module:**
- `InboxOutboxModule.forRoot(options)` - Sync configuration
- `InboxOutboxModule.forRootAsync(options)` - Async configuration

**Exports:**
- `OUTBOX_SERVICE`, `INBOX_SERVICE`, `OUTBOX_REPOSITORY`, `INBOX_REPOSITORY`

### 🐍 Python Package (`event-forge-inbox-outbox`)

Python implementation for Python/SQLAlchemy services.

**Models (Pydantic):**
- `CreateOutboxMessageDto`, `OutboxMessage`
- `CreateInboxMessageDto`, `InboxMessage`
- `OutboxMessageStatus`, `InboxMessageStatus` enums

**Repository Interfaces:**
- `IOutboxRepository` - Async repository interface
- `IInboxRepository` - Async repository interface

**SQLAlchemy Entities:**
- `OutboxMessageEntity` - PostgreSQL entity with indexes
- `InboxMessageEntity` - PostgreSQL entity with unique constraint

**Services:**
- `OutboxService` - Async polling, batch processing, cleanup
- `InboxService` - Handler registration, message processing

**Installation:**
```bash
pip install event-forge-inbox-outbox
pip install event-forge-inbox-outbox[rabbitmq]  # with RabbitMQ support
```

**Target:** Event-Forge Agent (Python service)

## Installation

```bash
# Core package
npm install @callairis/event-forge-core

# TypeORM adapter
npm install @callairis/event-forge-typeorm typeorm

# Mongoose adapter
npm install @callairis/event-forge-mongoose mongoose

# RabbitMQ publishers
npm install @callairis/event-forge-rabbitmq

# NestJS module (includes all)
npm install @callairis/event-forge-nestjs
```

## Quick Start

### TypeORM (PostgreSQL)

```typescript
import { DataSource } from 'typeorm';
import { OutboxService, InboxService } from '@callairis/event-forge-core';
import {
  TypeOrmOutboxRepository,
  TypeOrmInboxRepository,
  OutboxMessageEntity,
  InboxMessageEntity,
} from '@callairis/event-forge-typeorm';
import { GolevelupPublisher } from '@callairis/event-forge-rabbitmq';

// Setup DataSource
const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'mydb',
  entities: [OutboxMessageEntity, InboxMessageEntity],
  synchronize: false, // Use migrations in production
});

await dataSource.initialize();

// Create repositories
const outboxRepository = new TypeOrmOutboxRepository(dataSource);
const inboxRepository = new TypeOrmInboxRepository(dataSource);

// Create publisher (implementation varies)
const publisher = new GolevelupPublisher(/* config */);

// Create services
const outboxService = new OutboxService(outboxRepository, publisher, {
  pollingInterval: 1000,
  batchSize: 10,
  maxRetries: 3,
});

const inboxService = new InboxService(inboxRepository, {
  retentionDays: 7,
});

// Start polling
outboxService.startPolling();
inboxService.startCleanup();

// Create outbox message within transaction
await outboxService.withTransaction(async (txContext) => {
  // Your business logic here
  await userRepository.create({ name: 'John' }, txContext);

  // Create outbox message in same transaction
  await outboxService.createMessage({
    aggregateType: 'User',
    aggregateId: user.id,
    eventType: 'user.created',
    payload: { userId: user.id, name: user.name },
  }, txContext);
});

// Register inbox handler
inboxService.registerHandler('user.created', async (message) => {
  console.log('Received user.created event:', message.payload);
  // Process message
});

// Receive message (called by your message consumer)
await inboxService.receiveMessage({
  messageId: 'unique-message-id',
  source: 'user-service',
  eventType: 'user.created',
  payload: { userId: '123', name: 'John' },
});
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run typecheck

# Format code
npm run format
```

## Project Structure

```
inbox-outbox/
├── packages/
│   ├── core/                 # @callairis/event-forge-core
│   ├── adapter-typeorm/      # @callairis/event-forge-typeorm
│   ├── adapter-mongoose/     # @callairis/event-forge-mongoose
│   ├── publisher-rabbitmq/   # @callairis/event-forge-rabbitmq
│   └── nestjs/               # @callairis/event-forge-nestjs
├── spec/
│   ├── schemas/              # JSON Schema definitions
│   └── migrations/           # Database migrations
└── examples/                 # Usage examples
```

## Implementation Status

### ✅ Completed

- [x] Monorepo setup with Turborepo
- [x] TypeScript, ESLint, Jest configuration
- [x] Core package interfaces
- [x] OutboxService with EventEmitter + polling
- [x] InboxService with handler registration
- [x] Decorators (@OutboxHandler, @InboxHandler)
- [x] Error classes (ProcessingError, DuplicateMessageError)
- [x] TypeORM entities with proper indexes
- [x] TypeORM OutboxRepository with SKIP LOCKED
- [x] TypeORM InboxRepository with deduplication

### 🚧 In Progress

- [ ] Mongoose adapter (schemas + repositories)
- [ ] RabbitMQ publishers (Golevelup + Microservices)
- [ ] NestJS module (forRoot + forRootAsync)

### 📋 Planned

- [ ] Unit tests (>80% coverage)
- [ ] Integration tests with testcontainers
- [ ] Python package (SQLAlchemy + Motor)
- [ ] Migration scripts
- [ ] API documentation
- [ ] Usage examples

## Key Features

### Outbox Pattern

- **Transactional Consistency**: Messages created in same transaction as business logic
- **Guaranteed Delivery**: Messages persisted before publishing
- **Retry Logic**: Exponential backoff with jitter
- **Concurrent Processing**: Uses database locking (SKIP LOCKED)
- **Immediate Processing**: EventEmitter triggers immediate publish
- **Fallback Polling**: Cron-based polling as backup
- **Cleanup**: Automatic cleanup of old messages

### Inbox Pattern

- **Deduplication**: Unique constraint prevents duplicate processing
- **Handler Registration**: Type-safe event handlers
- **Error Handling**: ProcessingError for permanent failures
- **Cleanup**: Automatic cleanup of processed messages

## Publishing

### NPM Packages

Publishing happens automatically via GitHub Actions when you push a version tag:

```bash
# Bump version in all package.json files
pnpm version patch  # or minor, major

# Push with tags
git push origin main --follow-tags
```

The CI/CD pipeline will:
1. Build all packages
2. Run tests
3. Publish to NPM registry

**Required Secret**: `NPM_TOKEN` must be configured in GitHub repository settings.

### Manual Publishing

If you need to publish manually:

```bash
# Build all packages
pnpm run build

# Publish each package
cd packages/core && pnpm publish --access public
cd ../adapter-typeorm && pnpm publish --access public
cd ../adapter-mongoose && pnpm publish --access public
cd ../publisher-rabbitmq && pnpm publish --access public
cd ../nestjs && pnpm publish --access public
```

**Note**: Login to npm first with `npm login`

## Contributing

This is an internal Event-Forge library. See CONTRIBUTING.md for guidelines.

## License

MIT
