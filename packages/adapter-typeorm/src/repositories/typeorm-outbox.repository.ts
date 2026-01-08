import {
  CreateOutboxMessageDto,
  IOutboxRepository,
  OutboxMessage,
  OutboxMessageStatus,
} from '@prodforcode/event-forge-core';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';


import { OutboxMessageEntity } from '../entities/outbox-message.entity';

/**
 * TypeORM Implementation of IOutboxRepository
 * Optimized for PostgreSQL with SKIP LOCKED for concurrent processing
 */
export class TypeOrmOutboxRepository implements IOutboxRepository {
  private readonly repository: Repository<OutboxMessageEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repository = dataSource.getRepository(OutboxMessageEntity);
  }

  async create(
    dto: CreateOutboxMessageDto,
    transactionContext?: unknown,
  ): Promise<OutboxMessage> {
    const entityManager = transactionContext as EntityManager | undefined;
    const repo = entityManager?.getRepository(OutboxMessageEntity) ?? this.repository;

    const entity = repo.create({
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

    const saved = await repo.save(entity);
    return saved;
  }

  async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
    const now = new Date();

    // Use raw query with FOR UPDATE SKIP LOCKED for PostgreSQL
    const query = this.repository
      .createQueryBuilder('outbox')
      .where('outbox.status IN (:...statuses)', {
        statuses: [OutboxMessageStatus.PENDING, OutboxMessageStatus.FAILED],
      })
      .andWhere('(outbox.scheduledAt IS NULL OR outbox.scheduledAt <= :now)', { now })
      .andWhere(
        '(outbox.lockedAt IS NULL OR outbox.lockedAt < :lockTimeout)',
        { lockTimeout: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes timeout
      )
      .orderBy('outbox.createdAt', 'ASC')
      .limit(limit)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked');

    const messages = await query.getMany();

    // Update locked status
    if (messages.length > 0) {
      const ids = messages.map((m) => m.id);
      await this.repository.update(ids, {
        status: OutboxMessageStatus.PROCESSING,
        lockedBy: lockerId,
        lockedAt: new Date(),
      });

      // Refetch to get updated entities
      return this.repository.findByIds(ids);
    }

    return [];
  }

  async markPublished(id: string): Promise<void> {
    await this.repository.update(id, {
      status: OutboxMessageStatus.PUBLISHED,
      lockedBy: null,
      lockedAt: null,
    } as never);
  }

  async markFailed(id: string, error: string, permanent = false): Promise<void> {
    const status = permanent
      ? OutboxMessageStatus.PERMANENTLY_FAILED
      : OutboxMessageStatus.FAILED;

    // Use atomic increment to avoid read-then-write race condition
    await this.repository
      .createQueryBuilder()
      .update(OutboxMessageEntity)
      .set({
        status,
        retryCount: () => 'retry_count + 1',
        errorMessage: error,
        lockedBy: null,
        lockedAt: null,
      } as never)
      .where('id = :id', { id })
      .execute();
  }

  async releaseLock(id: string): Promise<void> {
    await this.repository.update(id, {
      status: OutboxMessageStatus.PENDING,
      lockedBy: null,
      lockedAt: null,
    } as never);
  }

  async releaseStaleLocks(olderThan: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(OutboxMessageEntity)
      .set({
        status: OutboxMessageStatus.PENDING,
        lockedBy: null,
        lockedAt: null,
      } as never)
      .where('status = :status', { status: OutboxMessageStatus.PROCESSING })
      .andWhere('lockedAt < :olderThan', { olderThan })
      .execute();

    return result.affected ?? 0;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      status: OutboxMessageStatus.PUBLISHED,
      createdAt: LessThan(date),
    });

    return result.affected ?? 0;
  }

  async withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (entityManager) => {
      return operation(entityManager);
    });
  }
}
