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
│  ├── PostgreSQL (TypeORM)     → @callairis/event-forge-typeorm       │
│  ├── MongoDB (Mongoose)       → @callairis/event-forge-mongoose      │
│  └── Python (SQLAlchemy)      → event-forge-inbox-outbox (PyPI)         │
├─────────────────────────────────────────────────────────────────────────┤
│  Publishers (pluggable)                                                 │
│  ├── RabbitMQ (@golevelup)    → @callairis/event-forge-rabbitmq      │
│  └── RabbitMQ (microservices) → For @nestjs/microservices               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/
├── core/                 # @callairis/event-forge-core
├── adapter-typeorm/      # @callairis/event-forge-typeorm
├── adapter-mongoose/     # @callairis/event-forge-mongoose
├── publisher-rabbitmq/   # @callairis/event-forge-rabbitmq
├── nestjs/               # @callairis/event-forge-nestjs
└── python/               # event-forge-inbox-outbox (PyPI)
```

## Core Interfaces

### IOutboxRepository

Stores outgoing messages with transactional guarantees:

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

Stores and deduplicates incoming messages:

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

Publishes messages to message brokers:

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

## Message Status Flow

```
pending → processing → published
                   └→ failed → pending (retry)
                            └→ permanently_failed
```

## NestJS Module Integration

### Basic Setup

```typescript
import { InboxOutboxModule } from '@callairis/event-forge-nestjs';
import { TypeOrmOutboxRepository } from '@callairis/event-forge-typeorm';
import { GolevelupPublisher } from '@callairis/event-forge-rabbitmq';

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

Exponential backoff with jitter: 5s, 10s, 20s, 40s, 80s

```typescript
private calculateBackoff(retryCount: number): number {
  const base = 5000;
  const delay = base * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000;
  return delay + jitter;
}
```

## Reference Documentation

- [Complete Interface Definitions](references/interfaces.md) - Full TypeScript interfaces and types
