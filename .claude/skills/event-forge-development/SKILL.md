---
name: event-forge-development
description: Implements Transactional Inbox-Outbox pattern for reliable message delivery in distributed systems. Use when creating message-based services, implementing outbox/inbox repositories, adding database adapters (TypeORM, Mongoose), configuring RabbitMQ publishers, or integrating the NestJS InboxOutboxModule. Supports PostgreSQL, MongoDB, and Python SQLAlchemy.
---

# Event-Forge Development

Event-Forge is a database-agnostic library implementing the Transactional Inbox-Outbox pattern for reliable message delivery across distributed systems.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Core Layer (database-agnostic)                                         │
│  ├── Interfaces: IOutboxRepository, IInboxRepository, IMessagePublisher │
│  ├── Services: OutboxService, InboxService                              │
│  └── Errors: ProcessingError                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Adapters (pluggable)                                                   │
│  ├── PostgreSQL (TypeORM)     → @event-forge/inbox-outbox-typeorm       │
│  ├── MongoDB (Mongoose)       → @event-forge/inbox-outbox-mongoose      │
│  └── Python (SQLAlchemy)      → event-forge-inbox-outbox (PyPI)         │
├─────────────────────────────────────────────────────────────────────────┤
│  Publishers (pluggable)                                                 │
│  ├── RabbitMQ (@golevelup)    → @event-forge/inbox-outbox-rabbitmq      │
│  └── RabbitMQ (microservices) → For @nestjs/microservices               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/
├── core/                 # @event-forge/inbox-outbox-core
├── adapter-typeorm/      # @event-forge/inbox-outbox-typeorm
├── adapter-mongoose/     # @event-forge/inbox-outbox-mongoose
├── publisher-rabbitmq/   # @event-forge/inbox-outbox-rabbitmq
├── nestjs/               # @event-forge/inbox-outbox-nestjs
└── python/               # event-forge-inbox-outbox (PyPI)
```

## Core Interfaces

### IOutboxRepository

Implement for storing outgoing messages with transactional guarantees:

```typescript
interface IOutboxRepository {
  create(dto: CreateOutboxMessageDto, context?: unknown): Promise<OutboxMessage>;
  fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
  withTransaction<T>(operation: (ctx: unknown) => Promise<T>): Promise<T>;
  releaseLock(id: string): Promise<void>;
  releaseStaleLocks(olderThan: Date): Promise<number>;
  deleteOlderThan(date: Date): Promise<number>;
}
```

### IInboxRepository

Implement for storing and deduplicating incoming messages:

```typescript
interface IInboxRepository {
  record(dto: CreateInboxMessageDto): Promise<{ message: InboxMessage; isDuplicate: boolean }>;
  exists(messageId: string, source: string): Promise<boolean>;
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  deleteOlderThan(date: Date): Promise<number>;
}
```

### IMessagePublisher

Implement for publishing messages to message brokers:

```typescript
interface IMessagePublisher {
  publish(message: OutboxMessage, options?: PublishOptions): Promise<boolean>;
}
```

## Message Flow Pattern

```
1. Business Logic + createMessage() in transaction
2. Commit → EventEmitter.emit('outbox:created')
3. Immediate: OutboxService.processMessage(id)
4. Fallback: Cron polling every 1s
5. Publish to RabbitMQ via IMessagePublisher
6. Mark published or retry with exponential backoff
```

## Creating a TypeORM Adapter

### Entity Definition

```typescript
// packages/adapter-typeorm/entities/outbox-message.entity.ts
@Entity('outbox_messages')
@Index(['status', 'scheduledAt'])
@Index(['aggregateType', 'aggregateId'])
export class OutboxMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'aggregate_type', length: 100 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', length: 255 })
  aggregateId: string;

  @Column({ name: 'event_type', length: 100 })
  @Index()
  eventType: string;

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column({ length: 30, default: 'pending' })
  status: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 5 })
  maxRetries: number;

  @Column({ name: 'locked_by', length: 100, nullable: true })
  lockedBy: string;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### Repository Implementation

Use `SKIP LOCKED` for PostgreSQL concurrent access:

```typescript
async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
  const result = await this.dataSource.query(`
    UPDATE outbox_messages
    SET locked_by = $1, locked_at = $2, status = 'processing'
    WHERE id IN (
      SELECT id FROM outbox_messages
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= $2)
        AND (locked_at IS NULL OR locked_at < $3)
      ORDER BY created_at
      LIMIT $4
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [lockerId, now, lockTimeout, limit]);
  return result;
}
```

## Creating a Mongoose Adapter

### Schema Definition

```typescript
@Schema({ timestamps: true, collection: 'outbox_messages' })
export class OutboxMessageDocument extends Document {
  @Prop({ required: true })
  aggregateType: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ default: 'pending', index: true })
  status: string;

  @Prop({ default: false, index: true })
  isLocked: boolean;
}
```

### Repository Implementation

Use `findOneAndUpdate` for atomic locking:

```typescript
async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
  const messages: OutboxMessage[] = [];
  for (let i = 0; i < limit; i++) {
    const doc = await this.model.findOneAndUpdate(
      { status: 'pending', isLocked: false },
      { $set: { isLocked: true, lockedBy: lockerId, status: 'processing' } },
      { sort: { retryCount: 1, createdAt: 1 }, new: true },
    );
    if (!doc) break;
    messages.push(this.toOutboxMessage(doc));
  }
  return messages;
}
```

## NestJS Module Integration

### Basic Setup

```typescript
import { InboxOutboxModule } from '@event-forge/inbox-outbox-nestjs';
import { TypeOrmOutboxRepository } from '@event-forge/inbox-outbox-typeorm';
import { GolevelupPublisher } from '@event-forge/inbox-outbox-rabbitmq';

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

### Async Configuration

```typescript
InboxOutboxModule.forRootAsync({
  imports: [TypeOrmModule, RabbitMQModule],
  useFactory: (dataSource: DataSource, amqp: AmqpConnection) => ({
    outboxRepository: {
      provide: OUTBOX_REPOSITORY,
      useFactory: () => new TypeOrmOutboxRepository(dataSource),
    },
    messagePublisher: {
      provide: MESSAGE_PUBLISHER,
      useFactory: () => new GolevelupPublisher(amqp, { exchange: 'events' }),
    },
  }),
  inject: [DataSource, AmqpConnection],
})
```

## Service Usage

### Creating Transactional Messages

```typescript
@Injectable()
export class OrderService {
  constructor(private outboxService: OutboxService) {}

  async createOrder(dto: CreateOrderDto) {
    return this.outboxService.withTransaction(async (manager) => {
      const order = await this.orderRepository.create(dto, manager);

      await this.outboxService.createMessage({
        aggregateType: 'Order',
        aggregateId: order.id,
        eventType: 'OrderCreated',
        payload: { orderId: order.id, ...dto },
      }, manager);

      return order;
    });
  }
}
```

## Retry Strategy

Implement exponential backoff with jitter:

```typescript
private calculateBackoff(retryCount: number): number {
  const base = 5000;  // 5 seconds
  const delay = base * Math.pow(2, retryCount);  // 5s, 10s, 20s, 40s, 80s
  const jitter = Math.random() * 1000;
  return delay + jitter;
}
```

## Message Status Flow

```
pending → processing → published
                   └→ failed → pending (retry)
                            └→ permanently_failed
```

## Testing Guidelines

- Use testcontainers for integration tests with PostgreSQL, MongoDB, RabbitMQ
- Unit test core services with mocked repositories
- Test transactional boundaries ensure atomicity
- Verify lock acquisition and release
- Test retry logic with simulated failures

## Integration Reference

See [references/interfaces.md](references/interfaces.md) for complete interface definitions.
