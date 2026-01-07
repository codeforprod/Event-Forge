import {
  CreateInboxMessageDto,
  IInboxRepository,
  InboxMessageStatus,
  RecordInboxMessageResult,
} from '@callairis/event-forge-core';
import { DataSource, LessThan, Repository } from 'typeorm';


import { InboxMessageEntity } from '../entities/inbox-message.entity';

/**
 * TypeORM Implementation of IInboxRepository
 * Uses unique constraint for deduplication
 */
export class TypeOrmInboxRepository implements IInboxRepository {
  private readonly repository: Repository<InboxMessageEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(InboxMessageEntity);
  }

  async record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult> {
    // Check if message already exists
    const existing = await this.repository.findOne({
      where: {
        messageId: dto.messageId,
        source: dto.source,
      },
    });

    if (existing) {
      return {
        message: existing,
        isDuplicate: true,
      };
    }

    // Create new message
    const entity = this.repository.create({
      messageId: dto.messageId,
      source: dto.source,
      eventType: dto.eventType,
      payload: dto.payload,
      status: InboxMessageStatus.RECEIVED,
    });

    try {
      const saved = await this.repository.save(entity);
      return {
        message: saved,
        isDuplicate: false,
      };
    } catch (error) {
      // Handle unique constraint violation (race condition)
      if ((error as { code?: string }).code === '23505') {
        // PostgreSQL unique violation code
        const existing = await this.repository.findOne({
          where: {
            messageId: dto.messageId,
            source: dto.source,
          },
        });

        if (!existing) {
          throw new Error(
            `Race condition: Duplicate key error but message not found for messageId=${dto.messageId}, source=${dto.source}`,
          );
        }

        return {
          message: existing,
          isDuplicate: true,
        };
      }
      throw error;
    }
  }

  async exists(messageId: string, source: string): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        messageId,
        source,
      },
    });

    return count > 0;
  }

  async markProcessing(id: string): Promise<void> {
    await this.repository.update(id, {
      status: InboxMessageStatus.PROCESSING,
    });
  }

  async markProcessed(id: string): Promise<void> {
    await this.repository.update(id, {
      status: InboxMessageStatus.PROCESSED,
      processedAt: new Date(),
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.repository.update(id, {
      status: InboxMessageStatus.FAILED,
      errorMessage: error,
    });
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      status: InboxMessageStatus.PROCESSED,
      createdAt: LessThan(date),
    });

    return result.affected ?? 0;
  }
}
