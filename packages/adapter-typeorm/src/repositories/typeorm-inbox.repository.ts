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

  async findRetryable(limit: number): Promise<InboxMessage[]> {
    const now = new Date();
    const messages: InboxMessage[] = [];

    // Use SELECT FOR UPDATE SKIP LOCKED for atomic locking to prevent race conditions
    // We need to use a transaction and update status atomically
    const queryRunner = this.repository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find and lock messages
      const locked = await queryRunner.manager
        .createQueryBuilder(InboxMessageEntity, 'inbox')
        .where('inbox.status = :status', { status: InboxMessageStatus.FAILED })
        .andWhere('inbox.retryCount < inbox.maxRetries')
        .andWhere('(inbox.scheduledAt IS NULL OR inbox.scheduledAt <= :now)', { now })
        .orderBy('inbox.createdAt', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write_or_fail')
        .getMany();

      // Update status to PROCESSING atomically
      for (const message of locked) {
        await queryRunner.manager.update(
          InboxMessageEntity,
          { id: message.id },
          { status: InboxMessageStatus.PROCESSING },
        );
      }

      await queryRunner.commitTransaction();
      messages.push(...locked);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return messages;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      status: InboxMessageStatus.PROCESSED,
      createdAt: LessThan(date),
    });

    return result.affected ?? 0;
  }
}
