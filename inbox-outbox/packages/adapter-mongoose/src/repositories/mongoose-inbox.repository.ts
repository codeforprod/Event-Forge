import { Model } from 'mongoose';
import {
  CreateInboxMessageDto,
  IInboxRepository,
  InboxMessageStatus,
  RecordInboxMessageResult,
} from '@event-forge/inbox-outbox-core';
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
      return {
        message: this.toInboxMessage(existing),
        isDuplicate: true,
      };
    }

    // Create new message
    const document = new this.model({
      messageId: dto.messageId,
      source: dto.source,
      eventType: dto.eventType,
      payload: dto.payload,
      status: InboxMessageStatus.RECEIVED,
    });

    try {
      const saved = await document.save();
      return {
        message: this.toInboxMessage(saved),
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

        return {
          message: this.toInboxMessage(existing!),
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

  async markProcessing(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: InboxMessageStatus.PROCESSING,
        },
      },
    );
  }

  async markProcessed(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: InboxMessageStatus.PROCESSED,
        },
      },
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      {
        $set: {
          status: InboxMessageStatus.FAILED,
          errorMessage: error,
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

  /**
   * Convert Mongoose document to InboxMessage interface
   */
  private toInboxMessage(doc: InboxMessageDocument) {
    return {
      id: doc._id.toString(),
      messageId: doc.messageId,
      source: doc.source,
      eventType: doc.eventType,
      payload: doc.payload,
      status: doc.status,
      errorMessage: doc.errorMessage ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
