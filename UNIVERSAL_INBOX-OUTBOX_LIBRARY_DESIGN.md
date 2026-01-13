# Universal Inbox-Outbox Library Design

## Overview

A database-agnostic library for reliable message delivery using the Transactional Inbox-Outbox pattern.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    @prodforcode/event-forge (NPM)                          │
│                    event-forge-inbox-outbox (PyPI)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Core Layer (database-agnostic)                                         │
│  ├── Interfaces: IOutboxRepository, IInboxRepository                    │
│  ├── Services: OutboxService, InboxService                              │
│  ├── Decorators: @OutboxHandler, @InboxHandler                          │
│  └── Errors: ProcessingError                                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Adapters (pluggable)                                                   │
│  ├── PostgreSQL (TypeORM)     → event-forge Backend                           │
│  ├── PostgreSQL (SQLAlchemy)  → event-forge Agent (Python)                    │
│  ├── MongoDB (Mongoose)       → Holocron, Legacy projects               │
│  └── Custom                   → User-defined                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Publishers (pluggable)                                                 │
│  ├── RabbitMQ (@golevelup)    → Default                                 │
│  ├── RabbitMQ (microservices) → Holocron style                          │
│  ├── RabbitMQ (aio-pika)      → Python Agent                            │
│  └── Custom                   → Kafka, Redis Streams, etc.              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
inbox-outbox/
├── spec/
│   ├── schemas/
│   │   ├── outbox-message.json       # JSON Schema (source of truth)
│   │   └── inbox-message.json
│   └── migrations/
│       ├── postgresql/
│       │   ├── 001_create_outbox.sql
│       │   └── 002_create_inbox.sql
│       └── mongodb/
│           └── indexes.js
│
├── packages/
│   ├── core/                         # @prodforcode/event-forge-core
│   │   ├── interfaces/
│   │   │   ├── outbox-repository.interface.ts
│   │   │   ├── inbox-repository.interface.ts
│   │   │   └── message-publisher.interface.ts
│   │   ├── services/
│   │   │   ├── outbox.service.ts
│   │   │   └── inbox.service.ts
│   │   ├── decorators/
│   │   │   ├── outbox-handler.decorator.ts
│   │   │   └── inbox-handler.decorator.ts
│   │   ├── errors/
│   │   │   └── processing.error.ts
│   │   └── index.ts
│   │
│   ├── adapter-typeorm/              # @prodforcode/event-forge-typeorm
│   │   ├── entities/
│   │   │   ├── outbox-message.entity.ts
│   │   │   └── inbox-message.entity.ts
│   │   ├── repositories/
│   │   │   ├── typeorm-outbox.repository.ts
│   │   │   └── typeorm-inbox.repository.ts
│   │   └── index.ts
│   │
│   ├── adapter-mongoose/             # @prodforcode/event-forge-mongoose
│   │   ├── schemas/
│   │   │   ├── outbox-message.schema.ts
│   │   │   └── inbox-message.schema.ts
│   │   ├── repositories/
│   │   │   ├── mongoose-outbox.repository.ts
│   │   │   └── mongoose-inbox.repository.ts
│   │   └── index.ts
│   │
│   ├── publisher-rabbitmq/           # @prodforcode/event-forge-rabbitmq-publisher
│   │   ├── golevelup-publisher.ts
│   │   ├── microservices-publisher.ts
│   │   └── index.ts
│   │
│   ├── nestjs/                       # @prodforcode/event-forge-nestjs
│   │   ├── inbox-outbox.module.ts
│   │   └── index.ts
│   │
│   └── python/                       # event-forge-inbox-outbox (PyPI)
│       ├── core/
│       ├── adapters/
│       │   ├── sqlalchemy/
│       │   └── motor/                # MongoDB async
│       └── publishers/
│           └── aio_pika/
│
└── examples/
    ├── event-forge-backend/
    ├── event-forge-agent/
    └── holocron/
```

---

## Core Interfaces

### IOutboxRepository

```typescript
// packages/core/interfaces/outbox-repository.interface.ts

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

export interface CreateOutboxMessageDto {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scheduledAt?: Date;
}

export interface IOutboxRepository {
  // Create message (within transaction context)
  create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;
  
  // Fetch and lock pending messages
  fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
  
  // Update status
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
  
  // Lock management
  releaseLock(id: string): Promise<void>;
  releaseStaleLocks(olderThan: Date): Promise<number>;
  
  // Cleanup
  deleteOlderThan(date: Date): Promise<number>;
  
  // Transaction support
  withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
}
```

### IInboxRepository

```typescript
// packages/core/interfaces/inbox-repository.interface.ts

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

export interface CreateInboxMessageDto {
  messageId: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface IInboxRepository {
  // Record message (with deduplication)
  record(dto: CreateInboxMessageDto): Promise<{ message: InboxMessage; isDuplicate: boolean }>;
  
  // Check duplicate
  exists(messageId: string, source: string): Promise<boolean>;
  
  // Update status
  markProcessing(id: string): Promise<void>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  
  // Cleanup
  deleteOlderThan(date: Date): Promise<number>;
}
```

### IMessagePublisher

```typescript
// packages/core/interfaces/message-publisher.interface.ts

export interface PublishOptions {
  exchange?: string;
  routingKey?: string;
  headers?: Record<string, string>;
  delay?: number; // ms
}

export interface IMessagePublisher {
  publish(message: OutboxMessage, options?: PublishOptions): Promise<boolean>;
}
```

---

## TypeORM Adapter (PostgreSQL)

```typescript
// packages/adapter-typeorm/entities/outbox-message.entity.ts

import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown>;

  @Column({ length: 30, default: 'pending' })
  status: string;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', default: 5 })
  maxRetries: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date;

  @Column({ name: 'locked_by', length: 100, nullable: true })
  lockedBy: string;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

```typescript
// packages/adapter-typeorm/repositories/typeorm-outbox.repository.ts

import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual, IsNull, Or } from 'typeorm';
import { IOutboxRepository, OutboxMessage, CreateOutboxMessageDto } from '@prodforcode/event-forge-core';
import { OutboxMessageEntity } from '../entities/outbox-message.entity';

@Injectable()
export class TypeOrmOutboxRepository implements IOutboxRepository {
  constructor(private dataSource: DataSource) {}

  async create(dto: CreateOutboxMessageDto, manager?: EntityManager): Promise<OutboxMessage> {
    const repo = manager 
      ? manager.getRepository(OutboxMessageEntity)
      : this.dataSource.getRepository(OutboxMessageEntity);
    
    const entity = repo.create({
      ...dto,
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
    });
    
    return repo.save(entity);
  }

  async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 30000); // 30s timeout
    
    // Use raw query for SKIP LOCKED
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

  async markPublished(id: string): Promise<void> {
    await this.dataSource.getRepository(OutboxMessageEntity).update(id, {
      status: 'published',
      lockedBy: null,
      lockedAt: null,
    });
  }

  async markFailed(id: string, error: string, permanent = false): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxMessageEntity);
    const message = await repo.findOneBy({ id });
    
    if (!message) return;
    
    const shouldRetry = !permanent && message.retryCount < message.maxRetries;
    
    await repo.update(id, {
      status: shouldRetry ? 'pending' : (permanent ? 'permanently_failed' : 'failed'),
      errorMessage: error,
      retryCount: message.retryCount + 1,
      lockedBy: null,
      lockedAt: null,
      scheduledAt: shouldRetry 
        ? new Date(Date.now() + this.calculateBackoff(message.retryCount))
        : message.scheduledAt,
    });
  }

  async withTransaction<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(operation);
  }

  private calculateBackoff(retryCount: number): number {
    // Exponential backoff with jitter: 5s, 10s, 20s, 40s, 80s
    const base = 5000;
    const delay = base * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  // ... other methods
}
```

---

## Mongoose Adapter (MongoDB)

```typescript
// packages/adapter-mongoose/schemas/outbox-message.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'outbox_messages' })
export class OutboxMessageDocument extends Document {
  @Prop({ required: true })
  aggregateType: string;

  @Prop({ required: true })
  aggregateId: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Object })
  metadata: Record<string, unknown>;

  @Prop({ default: 'pending', index: true })
  status: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop({ default: 5 })
  maxRetries: number;

  @Prop()
  errorMessage: string;

  @Prop({ type: Date, index: true })
  scheduledAt: Date;

  @Prop({ default: false, index: true })
  isLocked: boolean;

  @Prop()
  lockedBy: string;

  @Prop({ type: Date })
  lockedAt: Date;

  // RabbitMQ specific (for compatibility with message-relay)
  @Prop()
  exchange: string;

  @Prop()
  routingKey: string;
}

export const OutboxMessageSchema = SchemaFactory.createForClass(OutboxMessageDocument);

// Compound index for efficient polling
OutboxMessageSchema.index({ status: 1, scheduledAt: 1, isLocked: 1 });
```

```typescript
// packages/adapter-mongoose/repositories/mongoose-outbox.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import { IOutboxRepository, OutboxMessage, CreateOutboxMessageDto } from '@prodforcode/event-forge-core';
import { OutboxMessageDocument } from '../schemas/outbox-message.schema';

@Injectable()
export class MongooseOutboxRepository implements IOutboxRepository {
  constructor(
    @InjectModel(OutboxMessageDocument.name) 
    private model: Model<OutboxMessageDocument>,
    @InjectConnection() 
    private connection: Connection,
  ) {}

  async create(dto: CreateOutboxMessageDto, session?: ClientSession): Promise<OutboxMessage> {
    const [doc] = await this.model.create([{
      ...dto,
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
      isLocked: false,
    }], { session });
    
    return this.toOutboxMessage(doc);
  }

  async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 30000);
    
    const messages: OutboxMessage[] = [];
    
    for (let i = 0; i < limit; i++) {
      // Atomic findOneAndUpdate for locking (MongoDB equivalent of SELECT FOR UPDATE)
      const doc = await this.model.findOneAndUpdate(
        {
          status: 'pending',
          isLocked: false,
          $or: [
            { scheduledAt: { $exists: false } },
            { scheduledAt: { $lte: now } },
          ],
        },
        {
          $set: {
            isLocked: true,
            lockedBy: lockerId,
            lockedAt: now,
            status: 'processing',
          },
        },
        {
          sort: { retryCount: 1, createdAt: 1 },
          new: true,
        },
      );
      
      if (!doc) break;
      messages.push(this.toOutboxMessage(doc));
    }
    
    return messages;
  }

  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await operation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private toOutboxMessage(doc: OutboxMessageDocument): OutboxMessage {
    return {
      id: doc._id.toString(),
      aggregateType: doc.aggregateType,
      aggregateId: doc.aggregateId,
      eventType: doc.eventType,
      payload: doc.payload,
      metadata: doc.metadata,
      status: doc.status as OutboxMessage['status'],
      retryCount: doc.retryCount,
      maxRetries: doc.maxRetries,
      errorMessage: doc.errorMessage,
      scheduledAt: doc.scheduledAt,
      lockedBy: doc.lockedBy,
      lockedAt: doc.lockedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // ... other methods
}
```

---

## NestJS Module

```typescript
// packages/nestjs/inbox-outbox.module.ts

import { DynamicModule, Module, Global, Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { 
  OutboxService, 
  InboxService, 
  IOutboxRepository, 
  IInboxRepository,
  IMessagePublisher,
  OUTBOX_REPOSITORY,
  INBOX_REPOSITORY,
  MESSAGE_PUBLISHER,
  INBOX_OUTBOX_CONFIG,
} from '@prodforcode/event-forge-core';

export interface InboxOutboxModuleOptions {
  // Repositories (required)
  outboxRepository: Provider<IOutboxRepository>;
  inboxRepository: Provider<IInboxRepository>;
  
  // Publisher (required)
  messagePublisher: Provider<IMessagePublisher>;
  
  // Config
  config?: {
    outbox?: {
      pollingInterval?: number;
      batchSize?: number;
      maxRetries?: number;
      lockTimeout?: number;
    };
    inbox?: {
      cleanupAfterDays?: number;
    };
  };
}

export interface InboxOutboxModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
  inject?: any[];
}

@Global()
@Module({})
export class InboxOutboxModule {
  static forRoot(options: InboxOutboxModuleOptions): DynamicModule {
    return {
      module: InboxOutboxModule,
      imports: [
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        options.outboxRepository,
        options.inboxRepository,
        options.messagePublisher,
        {
          provide: INBOX_OUTBOX_CONFIG,
          useValue: options.config || {},
        },
        OutboxService,
        InboxService,
      ],
      exports: [
        OutboxService,
        InboxService,
        OUTBOX_REPOSITORY,
        INBOX_REPOSITORY,
      ],
    };
  }

  static forRootAsync(options: InboxOutboxModuleAsyncOptions): DynamicModule {
    return {
      module: InboxOutboxModule,
      imports: [
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot(),
        ...(options.imports || []),
      ],
      providers: [
        {
          provide: 'INBOX_OUTBOX_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        {
          provide: OUTBOX_REPOSITORY,
          useFactory: (opts: InboxOutboxModuleOptions) => opts.outboxRepository,
          inject: ['INBOX_OUTBOX_OPTIONS'],
        },
        // ... similar for other providers
        OutboxService,
        InboxService,
      ],
      exports: [OutboxService, InboxService],
    };
  }
}
```

---

## Usage Examples

### event-forge Backend (PostgreSQL + TypeORM)

```typescript
// app.module.ts
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { TypeOrmOutboxRepository, TypeOrmInboxRepository } from '@prodforcode/event-forge-typeorm';
import { RabbitMQPublisher } from '@prodforcode/event-forge-rabbitmq-publisher';

@Module({
  imports: [
    InboxOutboxModule.forRootAsync({
      imports: [TypeOrmModule, RabbitMQModule],
      useFactory: (dataSource: DataSource, amqp: AmqpConnection) => ({
        outboxRepository: {
          provide: OUTBOX_REPOSITORY,
          useFactory: () => new TypeOrmOutboxRepository(dataSource),
        },
        inboxRepository: {
          provide: INBOX_REPOSITORY,
          useFactory: () => new TypeOrmInboxRepository(dataSource),
        },
        messagePublisher: {
          provide: MESSAGE_PUBLISHER,
          useFactory: () => new RabbitMQPublisher(amqp, {
            exchange: 'event-forge.events',
          }),
        },
      }),
      inject: [DataSource, AmqpConnection],
    }),
  ],
})
export class AppModule {}

// calls.service.ts
@Injectable()
export class CallsService {
  constructor(private outboxService: OutboxService) {}

  async scheduleCall(dto: ScheduleCallDto) {
    return this.outboxService.withTransaction(async (manager) => {
      const call = await this.callsRepository.create(dto, manager);
      
      await this.outboxService.createMessage({
        aggregateType: 'Call',
        aggregateId: call.id,
        eventType: 'CallScheduled',
        payload: { callId: call.id, ...dto },
        scheduledAt: dto.scheduledAt,
      }, manager);
      
      return call;
    });
  }
}
```

### Holocron (MongoDB + Mongoose)

```typescript
// app.module.ts
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { MongooseOutboxRepository, MongooseInboxRepository } from '@prodforcode/event-forge-mongoose';
import { MicroservicesPublisher } from '@prodforcode/event-forge-rabbitmq-publisher';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'OutboxMessage', schema: OutboxMessageSchema },
      { name: 'InboxMessage', schema: InboxMessageSchema },
    ]),
    InboxOutboxModule.forRoot({
      outboxRepository: {
        provide: OUTBOX_REPOSITORY,
        useClass: MongooseOutboxRepository,
      },
      inboxRepository: {
        provide: INBOX_REPOSITORY,
        useClass: MongooseInboxRepository,
      },
      messagePublisher: {
        provide: MESSAGE_PUBLISHER,
        useFactory: (client: ClientProxy) => new MicroservicesPublisher(client),
        inject: ['RABBITMQ_SERVICE'],
      },
    }),
  ],
})
export class AppModule {}

// user.action.ts
@Injectable()
export class CreateUserAction {
  constructor(private outboxService: OutboxService) {}

  async execute(dto: CreateUserDto) {
    return this.outboxService.withTransaction(async (session) => {
      const user = await this.userRepository.create(dto, session);
      
      await this.outboxService.createMessage({
        aggregateType: 'User',
        aggregateId: user.id,
        eventType: 'UserCreated',
        payload: { userId: user.id, email: user.email },
      }, session);
      
      return user;
    });
  }
}
```

### event-forge Agent (Python + SQLAlchemy)

```python
# config.py
from event-forge_inbox_outbox import InboxOutboxConfig
from event-forge_inbox_outbox.adapters.sqlalchemy import SQLAlchemyOutboxRepository
from event-forge_inbox_outbox.publishers.aio_pika import AioPikaPublisher

config = InboxOutboxConfig(
    outbox_repository=SQLAlchemyOutboxRepository(engine),
    inbox_repository=SQLAlchemyInboxRepository(engine),
    message_publisher=AioPikaPublisher(connection, exchange='event-forge.events'),
)

# agent.py
async def start_call(call_id: str):
    async with outbox_service.transaction() as session:
        # Business logic
        session_id = await livekit_client.create_session(call_id)
        
        # Outbox message
        await outbox_service.create_message(
            CreateOutboxMessageDto(
                aggregate_type="Call",
                aggregate_id=call_id,
                event_type="AgentCallStarted",
                payload={"callId": call_id, "sessionId": session_id},
            ),
            session=session,
        )
        
        return session_id
```

---

## NPM Package Names

| Package | Description | Use Case |
|---------|-------------|----------|
| `@prodforcode/event-forge-core` | Core interfaces & services | Always required |
| `@prodforcode/event-forge-typeorm` | PostgreSQL adapter | event-forge Backend |
| `@prodforcode/event-forge-mongoose` | MongoDB adapter | Holocron |
| `@prodforcode/event-forge-rabbitmq-publisher` | RabbitMQ publishers | All projects |
| `@prodforcode/event-forge-nestjs` | NestJS module | NestJS projects |

**Python:**
| Package | Description |
|---------|-------------|
| `event-forge-inbox-outbox` | Full Python package with SQLAlchemy + aio-pika |

---

## Compatibility Matrix

| Project | Database | Adapter | Publisher |
|---------|----------|---------|-----------|
| event-forge Backend | PostgreSQL | `typeorm` | `rabbitmq` (golevelup) |
| event-forge Agent | PostgreSQL | `sqlalchemy` | `aio-pika` |
| Holocron | MongoDB | `mongoose` | `rabbitmq` (microservices) |
| Future Project | Any | Custom | Custom |

---

## Migration from message-relay

For projects using `@aaa-gth/message-relay`:

```typescript
// Before
import { MessageRelayModule, RabbitMqOutboxMessage } from '@aaa-gth/message-relay';

// After
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { MongooseOutboxRepository } from '@prodforcode/event-forge-mongoose';

// Migration: RabbitMqOutboxMessage → OutboxService.createMessage()
// Migration: @TransactionalMessageHandler → @InboxHandler + OutboxService
// Migration: BoxState.TO_DO → 'pending'
// Migration: isLocked: boolean → lockedBy: string, lockedAt: Date
```

---

## Key Benefits

1. **Universal**: Works with any database (PostgreSQL, MongoDB, or custom)
2. **Pluggable**: Swap adapters without changing business logic
3. **Type-Safe**: Full TypeScript support with generics
4. **Polyglot**: TypeScript + Python packages with shared schemas
5. **Battle-Tested**: Based on patterns from message-relay
6. **NestJS Native**: First-class module support with DI
7. **Immediate Processing**: EventEmitter + polling hybrid
