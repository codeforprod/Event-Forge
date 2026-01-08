# Event-Forge Complete Interface Definitions

Complete TypeScript interface definitions for the Event-Forge inbox-outbox pattern.

## Core Types

### OutboxMessage

```typescript
export interface OutboxMessage {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'failed' | 'permanently_failed';
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  scheduledAt?: Date;
  lockedBy?: string;
  lockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### CreateOutboxMessageDto

```typescript
export interface CreateOutboxMessageDto {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scheduledAt?: Date;
}
```

### InboxMessage

```typescript
export interface InboxMessage {
  id: string;
  messageId: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'received' | 'processing' | 'processed' | 'failed';
  processedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}
```

### CreateInboxMessageDto

```typescript
export interface CreateInboxMessageDto {
  messageId: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
}
```

### PublishOptions

```typescript
export interface PublishOptions {
  exchange?: string;
  routingKey?: string;
  headers?: Record<string, string>;
  delay?: number; // milliseconds
}
```

## Repository Interfaces

### IOutboxRepository

```typescript
export interface IOutboxRepository {
  /**
   * Create a new outbox message within a transaction context.
   * @param dto - Message data
   * @param transactionContext - Database-specific transaction (EntityManager, ClientSession, etc.)
   */
  create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;

  /**
   * Fetch pending messages and lock them for processing.
   * Uses SELECT FOR UPDATE SKIP LOCKED (PostgreSQL) or findOneAndUpdate (MongoDB).
   * @param limit - Maximum messages to fetch
   * @param lockerId - Unique identifier for this processor instance
   */
  fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;

  /**
   * Mark a message as successfully published.
   * Clears lock information.
   */
  markPublished(id: string): Promise<void>;

  /**
   * Mark a message as failed.
   * If not permanent and retries remain, schedules for retry with backoff.
   * @param permanent - If true, marks as permanently_failed without retry
   */
  markFailed(id: string, error: string, permanent?: boolean): Promise<void>;

  /**
   * Release lock on a specific message without changing status.
   */
  releaseLock(id: string): Promise<void>;

  /**
   * Release stale locks from crashed processors.
   * @param olderThan - Release locks older than this timestamp
   * @returns Number of locks released
   */
  releaseStaleLocks(olderThan: Date): Promise<number>;

  /**
   * Delete processed messages older than the specified date.
   * @returns Number of messages deleted
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Execute an operation within a database transaction.
   * @param operation - Function receiving transaction context
   */
  withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
}
```

### IInboxRepository

```typescript
export interface IInboxRepository {
  /**
   * Record an incoming message with deduplication.
   * @returns Message and whether it was a duplicate
   */
  record(dto: CreateInboxMessageDto): Promise<{
    message: InboxMessage;
    isDuplicate: boolean;
  }>;

  /**
   * Check if a message has already been processed.
   * Used for idempotency checks.
   */
  exists(messageId: string, source: string): Promise<boolean>;

  /**
   * Mark message as being processed.
   */
  markProcessing(id: string): Promise<void>;

  /**
   * Mark message as successfully processed.
   * Sets processedAt timestamp.
   */
  markProcessed(id: string): Promise<void>;

  /**
   * Mark message as failed with error details.
   */
  markFailed(id: string, error: string): Promise<void>;

  /**
   * Delete processed messages older than the specified date.
   * @returns Number of messages deleted
   */
  deleteOlderThan(date: Date): Promise<number>;
}
```

### IMessagePublisher

```typescript
export interface IMessagePublisher {
  /**
   * Publish a message to the message broker.
   * @returns true if published successfully, false otherwise
   */
  publish(message: OutboxMessage, options?: PublishOptions): Promise<boolean>;
}
```

## Service Interfaces

### OutboxService

```typescript
export interface IOutboxService {
  /**
   * Create an outbox message within an existing transaction.
   */
  createMessage(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;

  /**
   * Execute business logic and message creation in a single transaction.
   */
  withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;

  /**
   * Process a specific message by ID (used for immediate processing).
   */
  processMessage(id: string): Promise<void>;

  /**
   * Start the polling processor (typically called on module init).
   */
  startProcessing(): void;

  /**
   * Stop the polling processor (typically called on module destroy).
   */
  stopProcessing(): void;
}
```

### InboxService

```typescript
export interface IInboxService {
  /**
   * Process an incoming message with deduplication.
   * @returns Whether the message was processed (false if duplicate)
   */
  processMessage(dto: CreateInboxMessageDto): Promise<boolean>;

  /**
   * Register a handler for a specific event type.
   */
  registerHandler(eventType: string, handler: (message: InboxMessage) => Promise<void>): void;

  /**
   * Check if a message has been processed before.
   */
  isDuplicate(messageId: string, source: string): Promise<boolean>;
}
```

## NestJS Module Options

### InboxOutboxModuleOptions

```typescript
export interface InboxOutboxModuleOptions {
  outboxRepository: Provider<IOutboxRepository>;
  inboxRepository: Provider<IInboxRepository>;
  messagePublisher: Provider<IMessagePublisher>;

  config?: {
    outbox?: {
      pollingInterval?: number;    // Default: 1000ms
      batchSize?: number;          // Default: 10
      maxRetries?: number;         // Default: 5
      lockTimeout?: number;        // Default: 30000ms
    };
    inbox?: {
      cleanupAfterDays?: number;   // Default: 30
    };
  };
}
```

### InboxOutboxModuleAsyncOptions

```typescript
export interface InboxOutboxModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
  inject?: any[];
}
```

## DI Tokens

```typescript
export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');
export const INBOX_REPOSITORY = Symbol('INBOX_REPOSITORY');
export const MESSAGE_PUBLISHER = Symbol('MESSAGE_PUBLISHER');
export const INBOX_OUTBOX_CONFIG = Symbol('INBOX_OUTBOX_CONFIG');
```

## Error Classes

### ProcessingError

Throw to indicate permanent failure (no retries):

```typescript
export class ProcessingError extends Error {
  constructor(message: string, public readonly permanent: boolean = true) {
    super(message);
    this.name = 'ProcessingError';
  }
}
```

## Database Schema Requirements

### PostgreSQL (outbox_messages table)

```sql
CREATE TABLE outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  status VARCHAR(30) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outbox_status_scheduled ON outbox_messages (status, scheduled_at);
CREATE INDEX idx_outbox_aggregate ON outbox_messages (aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_event_type ON outbox_messages (event_type);
```

### PostgreSQL (inbox_messages table)

```sql
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(255) NOT NULL,
  source VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(30) DEFAULT 'received',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, source)
);

CREATE INDEX idx_inbox_status ON inbox_messages (status);
CREATE INDEX idx_inbox_event_type ON inbox_messages (event_type);
```

### MongoDB Indexes

```javascript
// outbox_messages collection
db.outbox_messages.createIndex({ status: 1, scheduledAt: 1, isLocked: 1 });
db.outbox_messages.createIndex({ aggregateType: 1, aggregateId: 1 });
db.outbox_messages.createIndex({ eventType: 1 });

// inbox_messages collection
db.inbox_messages.createIndex({ messageId: 1, source: 1 }, { unique: true });
db.inbox_messages.createIndex({ status: 1 });
db.inbox_messages.createIndex({ eventType: 1 });
```

## Package Dependencies

### Core Package

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/schedule": "^4.0.0",
    "@nestjs/event-emitter": "^2.0.0"
  },
  "peerDependencies": {
    "rxjs": "^7.0.0"
  }
}
```

### TypeORM Adapter

```json
{
  "peerDependencies": {
    "@prodforcode/event-forge-core": "*",
    "typeorm": "^0.3.0",
    "@nestjs/typeorm": "^10.0.0"
  }
}
```

### Mongoose Adapter

```json
{
  "peerDependencies": {
    "@prodforcode/event-forge-core": "*",
    "mongoose": "^8.0.0",
    "@nestjs/mongoose": "^10.0.0"
  }
}
```

### RabbitMQ Publisher

```json
{
  "peerDependencies": {
    "@prodforcode/event-forge-core": "*",
    "@golevelup/nestjs-rabbitmq": "^5.0.0"
  }
}
```
