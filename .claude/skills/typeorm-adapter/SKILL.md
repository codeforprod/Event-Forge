---
name: typeorm-adapter
description: Implements PostgreSQL adapter for Event-Forge using TypeORM with SKIP LOCKED pattern for concurrent message processing. Use when creating outbox/inbox entities, implementing repository classes with row-level locking, writing database migrations, or configuring TypeORM connection for inbox-outbox pattern.
---

# TypeORM Adapter for Event-Forge

PostgreSQL adapter implementation using TypeORM for the Transactional Inbox-Outbox pattern.

## Package: @callairis/event-forge-typeorm

## Entity Definitions

### OutboxMessageEntity

```typescript
// packages/adapter-typeorm/entities/outbox-message.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

### InboxMessageEntity

```typescript
// packages/adapter-typeorm/entities/inbox-message.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('inbox_messages')
@Unique(['messageId', 'source'])
export class InboxMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', length: 255 })
  messageId: string;

  @Column({ length: 100 })
  source: string;

  @Column({ name: 'event_type', length: 100 })
  @Index()
  eventType: string;

  @Column('jsonb')
  payload: Record<string, unknown>;

  @Column({ length: 30, default: 'received' })
  @Index()
  status: string;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

## Repository Implementation

### TypeOrmOutboxRepository

Key pattern: **SELECT FOR UPDATE SKIP LOCKED** for concurrent processing without blocking.

```typescript
// packages/adapter-typeorm/repositories/typeorm-outbox.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  IOutboxRepository,
  OutboxMessage,
  CreateOutboxMessageDto,
} from '@callairis/event-forge-core';
import { OutboxMessageEntity } from '../entities/outbox-message.entity';

@Injectable()
export class TypeOrmOutboxRepository implements IOutboxRepository {
  constructor(private dataSource: DataSource) {}

  async create(
    dto: CreateOutboxMessageDto,
    manager?: EntityManager,
  ): Promise<OutboxMessage> {
    const repo = manager
      ? manager.getRepository(OutboxMessageEntity)
      : this.dataSource.getRepository(OutboxMessageEntity);

    const entity = repo.create({
      ...dto,
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
    });

    const saved = await repo.save(entity);
    return this.toOutboxMessage(saved);
  }

  async fetchAndLockPending(
    limit: number,
    lockerId: string,
  ): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 30000); // 30s timeout

    // Atomic UPDATE with SKIP LOCKED
    const result = await this.dataSource.query(
      `
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
    `,
      [lockerId, now, lockTimeout, limit],
    );

    return result.map(this.toOutboxMessage);
  }

  async markPublished(id: string): Promise<void> {
    await this.dataSource.getRepository(OutboxMessageEntity).update(id, {
      status: 'published',
      lockedBy: null,
      lockedAt: null,
    });
  }

  async markFailed(
    id: string,
    error: string,
    permanent = false,
  ): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxMessageEntity);
    const message = await repo.findOneBy({ id });

    if (!message) return;

    const shouldRetry = !permanent && message.retryCount < message.maxRetries;

    await repo.update(id, {
      status: shouldRetry
        ? 'pending'
        : permanent
          ? 'permanently_failed'
          : 'failed',
      errorMessage: error,
      retryCount: message.retryCount + 1,
      lockedBy: null,
      lockedAt: null,
      scheduledAt: shouldRetry
        ? new Date(Date.now() + this.calculateBackoff(message.retryCount))
        : message.scheduledAt,
    });
  }

  async releaseLock(id: string): Promise<void> {
    await this.dataSource.getRepository(OutboxMessageEntity).update(id, {
      lockedBy: null,
      lockedAt: null,
      status: 'pending',
    });
  }

  async releaseStaleLocks(olderThan: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(OutboxMessageEntity)
      .update(
        {
          status: 'processing',
          lockedAt: LessThan(olderThan),
        },
        {
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
        },
      );

    return result.affected || 0;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.dataSource
      .getRepository(OutboxMessageEntity)
      .delete({
        status: 'published',
        createdAt: LessThan(date),
      });

    return result.affected || 0;
  }

  async withTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(operation);
  }

  private calculateBackoff(retryCount: number): number {
    const base = 5000;
    const delay = base * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  private toOutboxMessage(entity: OutboxMessageEntity): OutboxMessage {
    return {
      id: entity.id,
      aggregateType: entity.aggregateType,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload,
      metadata: entity.metadata,
      status: entity.status as OutboxMessage['status'],
      retryCount: entity.retryCount,
      maxRetries: entity.maxRetries,
      errorMessage: entity.errorMessage,
      scheduledAt: entity.scheduledAt,
      lockedBy: entity.lockedBy,
      lockedAt: entity.lockedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
```

## Database Migrations

### Outbox Table Migration

```sql
-- spec/migrations/postgresql/001_create_outbox.sql
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

-- Indexes for efficient polling
CREATE INDEX idx_outbox_status_scheduled ON outbox_messages (status, scheduled_at);
CREATE INDEX idx_outbox_aggregate ON outbox_messages (aggregate_type, aggregate_id);
CREATE INDEX idx_outbox_event_type ON outbox_messages (event_type);
CREATE INDEX idx_outbox_locked ON outbox_messages (locked_at) WHERE status = 'processing';
```

### Inbox Table Migration

```sql
-- spec/migrations/postgresql/002_create_inbox.sql
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

## SKIP LOCKED Pattern Explanation

PostgreSQL's `FOR UPDATE SKIP LOCKED` enables non-blocking concurrent processing:

```
Processor A                    Processor B
    │                              │
    ▼                              ▼
SELECT ... FOR UPDATE          SELECT ... FOR UPDATE
SKIP LOCKED                    SKIP LOCKED
    │                              │
    ▼                              ▼
Locks rows 1, 2, 3            Skips 1, 2, 3
                              Locks rows 4, 5, 6
```

Benefits:
- No blocking between processors
- Guaranteed exactly-once processing per message
- Efficient resource utilization with multiple instances

## NestJS Module Registration

```typescript
// app.module.ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessageEntity, InboxMessageEntity } from '@callairis/event-forge-typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'app_db',
      entities: [OutboxMessageEntity, InboxMessageEntity],
      synchronize: false, // Use migrations in production
    }),
    TypeOrmModule.forFeature([OutboxMessageEntity, InboxMessageEntity]),
  ],
})
export class AppModule {}
```

## Reference Documentation

See [references/sql-patterns.md](references/sql-patterns.md) for advanced SQL patterns and optimizations.
