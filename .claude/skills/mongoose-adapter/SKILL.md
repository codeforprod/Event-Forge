---
name: mongoose-adapter
description: Implements MongoDB adapter for Event-Forge using Mongoose with findOneAndUpdate pattern for atomic message locking. Use when creating outbox/inbox schemas, implementing repository classes with optimistic locking, configuring MongoDB indexes, or setting up Mongoose connection for inbox-outbox pattern.
---

# Mongoose Adapter for Event-Forge

MongoDB adapter implementation using Mongoose for the Transactional Inbox-Outbox pattern.

## Package: @event-forge/inbox-outbox-mongoose

## Schema Definitions

### OutboxMessageSchema

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

  // For RabbitMQ routing
  @Prop()
  exchange: string;

  @Prop()
  routingKey: string;

  // Mongoose timestamps
  createdAt: Date;
  updatedAt: Date;
}

export const OutboxMessageSchema = SchemaFactory.createForClass(OutboxMessageDocument);

// Compound indexes for efficient polling
OutboxMessageSchema.index({ status: 1, scheduledAt: 1, isLocked: 1 });
OutboxMessageSchema.index({ aggregateType: 1, aggregateId: 1 });
```

### InboxMessageSchema

```typescript
// packages/adapter-mongoose/schemas/inbox-message.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'inbox_messages' })
export class InboxMessageDocument extends Document {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ default: 'received', index: true })
  status: string;

  @Prop({ type: Date })
  processedAt: Date;

  @Prop()
  errorMessage: string;

  createdAt: Date;
}

export const InboxMessageSchema = SchemaFactory.createForClass(InboxMessageDocument);

// Unique compound index for deduplication
InboxMessageSchema.index({ messageId: 1, source: 1 }, { unique: true });
```

## Repository Implementation

### MongooseOutboxRepository

Key pattern: **findOneAndUpdate** for atomic lock acquisition.

```typescript
// packages/adapter-mongoose/repositories/mongoose-outbox.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import {
  IOutboxRepository,
  OutboxMessage,
  CreateOutboxMessageDto,
} from '@event-forge/inbox-outbox-core';
import { OutboxMessageDocument } from '../schemas/outbox-message.schema';

@Injectable()
export class MongooseOutboxRepository implements IOutboxRepository {
  constructor(
    @InjectModel(OutboxMessageDocument.name)
    private model: Model<OutboxMessageDocument>,
    @InjectConnection()
    private connection: Connection,
  ) {}

  async create(
    dto: CreateOutboxMessageDto,
    session?: ClientSession,
  ): Promise<OutboxMessage> {
    const [doc] = await this.model.create(
      [
        {
          ...dto,
          status: 'pending',
          retryCount: 0,
          maxRetries: 5,
          isLocked: false,
        },
      ],
      { session },
    );

    return this.toOutboxMessage(doc);
  }

  async fetchAndLockPending(
    limit: number,
    lockerId: string,
  ): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockTimeout = new Date(now.getTime() - 30000);
    const messages: OutboxMessage[] = [];

    // Atomic findOneAndUpdate for each message (one at a time)
    for (let i = 0; i < limit; i++) {
      const doc = await this.model.findOneAndUpdate(
        {
          status: 'pending',
          isLocked: false,
          $or: [
            { scheduledAt: { $exists: false } },
            { scheduledAt: null },
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

  async markPublished(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: 'published',
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );
  }

  async markFailed(
    id: string,
    error: string,
    permanent = false,
  ): Promise<void> {
    const doc = await this.model.findById(id);
    if (!doc) return;

    const shouldRetry = !permanent && doc.retryCount < doc.maxRetries;

    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: shouldRetry
            ? 'pending'
            : permanent
              ? 'permanently_failed'
              : 'failed',
          errorMessage: error,
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
          ...(shouldRetry && {
            scheduledAt: new Date(
              Date.now() + this.calculateBackoff(doc.retryCount),
            ),
          }),
        },
        $inc: { retryCount: 1 },
      },
    );
  }

  async releaseLock(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: 'pending',
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );
  }

  async releaseStaleLocks(olderThan: Date): Promise<number> {
    const result = await this.model.updateMany(
      {
        status: 'processing',
        isLocked: true,
        lockedAt: { $lt: olderThan },
      },
      {
        $set: {
          status: 'pending',
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );

    return result.modifiedCount;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.model.deleteMany({
      status: 'published',
      createdAt: { $lt: date },
    });

    return result.deletedCount;
  }

  async withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
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

  private calculateBackoff(retryCount: number): number {
    const base = 5000;
    const delay = base * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000;
    return delay + jitter;
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
}
```

### MongooseInboxRepository

```typescript
// packages/adapter-mongoose/repositories/mongoose-inbox.repository.ts
@Injectable()
export class MongooseInboxRepository implements IInboxRepository {
  constructor(
    @InjectModel(InboxMessageDocument.name)
    private model: Model<InboxMessageDocument>,
  ) {}

  async record(
    dto: CreateInboxMessageDto,
  ): Promise<{ message: InboxMessage; isDuplicate: boolean }> {
    try {
      const doc = await this.model.create({
        ...dto,
        status: 'received',
      });

      return { message: this.toInboxMessage(doc), isDuplicate: false };
    } catch (error) {
      // Duplicate key error (E11000)
      if (error.code === 11000) {
        const existing = await this.model.findOne({
          messageId: dto.messageId,
          source: dto.source,
        });

        return { message: this.toInboxMessage(existing), isDuplicate: true };
      }
      throw error;
    }
  }

  async exists(messageId: string, source: string): Promise<boolean> {
    const count = await this.model.countDocuments({ messageId, source });
    return count > 0;
  }

  // ... other methods similar to outbox
}
```

## MongoDB Index Configuration

```javascript
// spec/migrations/mongodb/indexes.js

// Outbox collection indexes
db.outbox_messages.createIndex({ status: 1, scheduledAt: 1, isLocked: 1 });
db.outbox_messages.createIndex({ aggregateType: 1, aggregateId: 1 });
db.outbox_messages.createIndex({ eventType: 1 });
db.outbox_messages.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 604800 } // TTL: 7 days for published
);

// Inbox collection indexes
db.inbox_messages.createIndex({ messageId: 1, source: 1 }, { unique: true });
db.inbox_messages.createIndex({ status: 1 });
db.inbox_messages.createIndex({ eventType: 1 });
```

## findOneAndUpdate Pattern Explanation

MongoDB's `findOneAndUpdate` provides atomic document modification:

```
Processor A                    Processor B
    │                              │
    ▼                              ▼
findOneAndUpdate              findOneAndUpdate
{isLocked: false}             {isLocked: false}
    │                              │
    ▼                              ▼
Gets doc 1,                   Gets doc 2,
sets isLocked=true            sets isLocked=true
(atomic)                      (atomic)
```

Benefits:
- Atomic read-modify-write operation
- No race conditions between processors
- Document-level locking built into MongoDB

## Transactions with Replica Set

MongoDB transactions require a replica set. For local development:

```typescript
// Use in-memory replica set for tests
const container = await new MongoDBContainer('mongo:7')
  .withCommand(['--replSet', 'rs0'])
  .start();

// Or use single-node replica set locally
// mongod --replSet rs0 --bind_ip localhost
```

## NestJS Module Registration

```typescript
// app.module.ts
import { MongooseModule } from '@nestjs/mongoose';
import {
  OutboxMessageDocument,
  OutboxMessageSchema,
  InboxMessageDocument,
  InboxMessageSchema,
} from '@event-forge/inbox-outbox-mongoose';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/app_db'),
    MongooseModule.forFeature([
      { name: OutboxMessageDocument.name, schema: OutboxMessageSchema },
      { name: InboxMessageDocument.name, schema: InboxMessageSchema },
    ]),
  ],
})
export class AppModule {}
```

## Reference Documentation

See [references/mongodb-patterns.md](references/mongodb-patterns.md) for advanced MongoDB patterns and optimizations.
