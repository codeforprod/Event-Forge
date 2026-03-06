import {
  CreateInboxMessageDto,
  IInboxRepository,
  InboxMessage,
  InboxMessageStatus,
  RecordInboxMessageResult,
} from '@prodforcode/event-forge-core';
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
      // Status-aware dedup: allow re-processing of stuck or failed messages
      if (
        existing.status === InboxMessageStatus.PROCESSING ||
        existing.status === InboxMessageStatus.FAILED
      ) {
        return {
          message: existing,
          isDuplicate: false,
        };
      }

      // Truly done (processed, permanently_failed, received) — duplicate
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
      metadata: dto.metadata ?? undefined,
      status: InboxMessageStatus.RECEIVED,
      retryCount: 0,
      maxRetries: dto.maxRetries ?? 3,
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

        // Status-aware dedup even in race condition path
        if (
          existing.status === InboxMessageStatus.PROCESSING ||
          existing.status === InboxMessageStatus.FAILED
        ) {
          return {
            message: existing,
            isDuplicate: false,
          };
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

  async markProcessing(id: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(InboxMessageEntity)
      .set({ status: InboxMessageStatus.PROCESSING })
      .where('id = :id AND status IN (:...statuses)', {
        id,
        statuses: [InboxMessageStatus.RECEIVED, InboxMessageStatus.FAILED],
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markProcessed(id: string): Promise<void> {
    await this.repository.update(id, {
      status: InboxMessageStatus.PROCESSED,
      processedAt: new Date(),
    });
  }

  async markFailed(id: string, error: string, permanent = false, scheduledAt?: Date): Promise<void> {
    const status = permanent
      ? InboxMessageStatus.PERMANENTLY_FAILED
      : InboxMessageStatus.FAILED;

    // Use atomic increment for retry count
    await this.repository
      .createQueryBuilder()
      .update(InboxMessageEntity)
      .set({
        status,
        errorMessage: error,
        scheduledAt: scheduledAt ?? null,
        retryCount: () => 'retry_count + 1',
      } as never)
      .where('id = :id', { id })
      .execute();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      status: InboxMessageStatus.PROCESSED,
      createdAt: LessThan(date),
    });

    return result.affected ?? 0;
  }

  async findStuckProcessing(cutoffDate: Date, limit: number): Promise<InboxMessage[]> {
    const entities = await this.repository.find({
      where: {
        status: InboxMessageStatus.PROCESSING,
        updatedAt: LessThan(cutoffDate),
      },
      take: limit,
      order: { updatedAt: 'ASC' },
    });
    return entities;
  }

  async resetForRetry(id: string, reason: string): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(InboxMessageEntity)
      .set({
        status: InboxMessageStatus.FAILED,
        recoveryReason: reason,
        lastRecoveredAt: new Date(),
        errorMessage: `Recovered: ${reason}`,
        recoveryAttempts: () => 'recovery_attempts + 1',
      } as never)
      .where('id = :id AND status = :status', {
        id,
        status: InboxMessageStatus.PROCESSING,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async markPermanentlyFailedRecovery(id: string, reason: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(InboxMessageEntity)
      .set({
        status: InboxMessageStatus.PERMANENTLY_FAILED,
        recoveryReason: reason,
        lastRecoveredAt: new Date(),
        errorMessage: `Recovery exhausted: ${reason}`,
        recoveryAttempts: () => 'recovery_attempts + 1',
      } as never)
      .where('id = :id AND status = :status', {
        id,
        status: InboxMessageStatus.PROCESSING,
      })
      .execute();
  }
}
