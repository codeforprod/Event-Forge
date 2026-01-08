import {
  CreateOutboxMessageDto,
  IOutboxRepository,
  OutboxMessage,
  OutboxMessageStatus,
} from '@prodforcode/event-forge-core';
import { Connection, Model, ClientSession } from 'mongoose';

import { OutboxMessageDocument } from '../schemas/outbox-message.schema';

/**
 * Mongoose Implementation of IOutboxRepository
 * Uses atomic findOneAndUpdate for optimistic locking
 */
export class MongooseOutboxRepository implements IOutboxRepository {
  constructor(
    private readonly connection: Connection,
    private readonly model: Model<OutboxMessageDocument>,
  ) {}

  async create(
    dto: CreateOutboxMessageDto,
    transactionContext?: unknown,
  ): Promise<OutboxMessage> {
    const session = transactionContext as ClientSession | undefined;

    const document = new this.model({
      aggregateType: dto.aggregateType,
      aggregateId: dto.aggregateId,
      eventType: dto.eventType,
      payload: dto.payload,
      metadata: dto.metadata,
      scheduledAt: dto.scheduledAt,
      maxRetries: dto.maxRetries ?? 3,
      status: OutboxMessageStatus.PENDING,
      retryCount: 0,
    });

    const saved = await document.save({ session });
    return this.toOutboxMessage(saved);
  }

  async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
    const now = new Date();
    const lockTimeout = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    const messages: OutboxMessageDocument[] = [];

    // Use findOneAndUpdate in loop for atomic locking
    // This is MongoDB's equivalent to PostgreSQL's SKIP LOCKED
    for (let i = 0; i < limit; i++) {
      const message = await this.model.findOneAndUpdate(
        {
          status: { $in: [OutboxMessageStatus.PENDING, OutboxMessageStatus.FAILED] },
          $and: [
            { $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] },
            { $or: [{ lockedAt: null }, { lockedAt: { $lt: lockTimeout } }] },
          ],
        },
        {
          $set: {
            status: OutboxMessageStatus.PROCESSING,
            lockedBy: lockerId,
            lockedAt: new Date(),
          },
        },
        {
          new: true,
          sort: { createdAt: 1 }, // Process oldest first
        },
      );

      if (!message) {
        break;
      }

      messages.push(message);
    }

    return messages.map((doc) => this.toOutboxMessage(doc));
  }

  async markPublished(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: OutboxMessageStatus.PUBLISHED,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );
  }

  async markFailed(id: string, error: string, permanent = false): Promise<void> {
    const message = await this.model.findById(id);

    if (!message) {
      return;
    }

    const status = permanent
      ? OutboxMessageStatus.PERMANENTLY_FAILED
      : OutboxMessageStatus.FAILED;

    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status,
          errorMessage: error,
          lockedBy: null,
          lockedAt: null,
        },
        $inc: {
          retryCount: 1,
        },
      },
    );
  }

  async releaseLock(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: OutboxMessageStatus.PENDING,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );
  }

  async releaseStaleLocks(olderThan: Date): Promise<number> {
    const result = await this.model.updateMany(
      {
        status: OutboxMessageStatus.PROCESSING,
        lockedAt: { $lt: olderThan },
      },
      {
        $set: {
          status: OutboxMessageStatus.PENDING,
          lockedBy: null,
          lockedAt: null,
        },
      },
    );

    return result.modifiedCount;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.model.deleteMany({
      status: OutboxMessageStatus.PUBLISHED,
      createdAt: { $lt: date },
    });

    return result.deletedCount;
  }

  async withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
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

  /**
   * Convert Mongoose document to OutboxMessage interface
   */
  private toOutboxMessage(doc: OutboxMessageDocument): OutboxMessage {
    return {
      id: doc._id.toString(),
      aggregateType: doc.aggregateType,
      aggregateId: doc.aggregateId,
      eventType: doc.eventType,
      payload: doc.payload,
      metadata: doc.metadata ?? {},
      status: doc.status,
      retryCount: doc.retryCount,
      maxRetries: doc.maxRetries,
      errorMessage: doc.errorMessage ?? undefined,
      scheduledAt: doc.scheduledAt ?? undefined,
      lockedBy: doc.lockedBy ?? undefined,
      lockedAt: doc.lockedAt ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
