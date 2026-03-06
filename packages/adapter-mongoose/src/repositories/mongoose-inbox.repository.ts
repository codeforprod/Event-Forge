import {
  CreateInboxMessageDto,
  IInboxRepository,
  InboxMessage,
  InboxMessageStatus,
  RecordInboxMessageResult,
} from '@prodforcode/event-forge-core';
import { Model } from 'mongoose';

import { InboxMessageDocument } from '../schemas/inbox-message.schema';

/**
 * Mongoose Implementation of IInboxRepository
 * Handles deduplication through unique index on (messageId, source)
 */
export class MongooseInboxRepository implements IInboxRepository {
  constructor(private readonly model: Model<InboxMessageDocument>) {}

  async record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult> {
    // Check if message already exists
    const existing = await this.model.findOne({
      messageId: dto.messageId,
      source: dto.source,
    });

    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const message = this.toInboxMessage(existing as InboxMessageDocument);

      // Status-aware dedup: allow re-processing of stuck or failed messages
      if (
        existing.status === InboxMessageStatus.PROCESSING ||
        existing.status === InboxMessageStatus.FAILED
      ) {
        return {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message,
          isDuplicate: false,
        };
      }

      // Truly done (processed, permanently_failed, received) — duplicate
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message,
        isDuplicate: true,
      };
    }

    // Create new message
    const document = new this.model({
      messageId: dto.messageId,
      source: dto.source,
      eventType: dto.eventType,
      payload: dto.payload,
      metadata: dto.metadata ?? null,
      status: InboxMessageStatus.RECEIVED,
      retryCount: 0,
      maxRetries: dto.maxRetries ?? 3,
    });

    try {
      const saved = await document.save();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const message = this.toInboxMessage(saved as InboxMessageDocument);
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message,
        isDuplicate: false,
      };
    } catch (error) {
      // Handle unique constraint violation (race condition)
      if ((error as { code?: number }).code === 11000) {
        // MongoDB duplicate key error code
        const existing = await this.model.findOne({
          messageId: dto.messageId,
          source: dto.source,
        });

        if (!existing) {
          throw new Error(
            `Race condition: Duplicate key error but message not found for messageId=${dto.messageId}, source=${dto.source}`,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const message = this.toInboxMessage(existing as InboxMessageDocument);

        // Status-aware dedup even in race condition path
        if (
          existing.status === InboxMessageStatus.PROCESSING ||
          existing.status === InboxMessageStatus.FAILED
        ) {
          return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            message,
            isDuplicate: false,
          };
        }

        return {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message,
          isDuplicate: true,
        };
      }
      throw error;
    }
  }

  async exists(messageId: string, source: string): Promise<boolean> {
    const count = await this.model.countDocuments({
      messageId,
      source,
    });

    return count > 0;
  }

  async markProcessing(id: string): Promise<boolean> {
    const result = await this.model.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [InboxMessageStatus.RECEIVED, InboxMessageStatus.FAILED] },
      },
      {
        $set: { status: InboxMessageStatus.PROCESSING },
      },
      { new: true },
    );
    return result !== null;
  }

  async markProcessed(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: InboxMessageStatus.PROCESSED,
          processedAt: new Date(),
        },
      },
    );
  }

  async markFailed(id: string, error: string, permanent = false, scheduledAt?: Date): Promise<void> {
    const status = permanent
      ? InboxMessageStatus.PERMANENTLY_FAILED
      : InboxMessageStatus.FAILED;

    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status,
          errorMessage: error,
          scheduledAt: scheduledAt ?? null,
        },
        $inc: {
          retryCount: 1,
        },
      },
    );
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.model.deleteMany({
      status: InboxMessageStatus.PROCESSED,
      createdAt: { $lt: date },
    });

    return result.deletedCount;
  }

  async findStuckProcessing(cutoffDate: Date, limit: number): Promise<InboxMessage[]> {
    const docs = await this.model.find({
      status: InboxMessageStatus.PROCESSING,
      $or: [
        { updatedAt: { $lt: cutoffDate } },
        { updatedAt: null },
      ],
    }).sort({ updatedAt: 1 }).limit(limit);

    return docs.map((doc) =>
      this.toInboxMessage(doc as InboxMessageDocument),
    );
  }

  async resetForRetry(id: string, reason: string): Promise<boolean> {
    const result = await this.model.findOneAndUpdate(
      { _id: id, status: InboxMessageStatus.PROCESSING },
      {
        $set: {
          status: InboxMessageStatus.FAILED,
          recoveryReason: reason,
          lastRecoveredAt: new Date(),
          errorMessage: `Recovered: ${reason}`,
        },
        $inc: { recoveryAttempts: 1 },
      },
      { new: true },
    );
    return result !== null;
  }

  async markPermanentlyFailedRecovery(id: string, reason: string): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: id, status: InboxMessageStatus.PROCESSING },
      {
        $set: {
          status: InboxMessageStatus.PERMANENTLY_FAILED,
          recoveryReason: reason,
          lastRecoveredAt: new Date(),
          errorMessage: `Recovery exhausted: ${reason}`,
        },
        $inc: { recoveryAttempts: 1 },
      },
    );
  }

  /**
   * Convert Mongoose document to InboxMessage interface
   */
  private toInboxMessage(doc: InboxMessageDocument): InboxMessage {
    return {
      id: doc._id.toString(),
      messageId: doc.messageId,
      source: doc.source,
      eventType: doc.eventType,
      payload: doc.payload,
      metadata: doc.metadata ?? undefined,
      status: doc.status,
      errorMessage: doc.errorMessage ?? undefined,
      retryCount: doc.retryCount,
      maxRetries: doc.maxRetries,
      scheduledAt: doc.scheduledAt ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      recoveryAttempts: (doc as unknown as Record<string, unknown>).recoveryAttempts as number ?? 0,
      lastRecoveredAt: (doc as unknown as Record<string, unknown>).lastRecoveredAt as Date ?? undefined,
      recoveryReason: (doc as unknown as Record<string, unknown>).recoveryReason as string ?? undefined,
    };
  }
}
