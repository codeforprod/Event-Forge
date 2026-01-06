import { DataSource } from 'typeorm';
import { CreateOutboxMessageDto, IOutboxRepository, OutboxMessage } from '@event-forge/inbox-outbox-core';
export declare class TypeOrmOutboxRepository implements IOutboxRepository {
    private readonly dataSource;
    private readonly repository;
    constructor(dataSource: DataSource);
    create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;
    fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
    markPublished(id: string): Promise<void>;
    markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
    releaseLock(id: string): Promise<void>;
    releaseStaleLocks(olderThan: Date): Promise<number>;
    deleteOlderThan(date: Date): Promise<number>;
    withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=typeorm-outbox.repository.d.ts.map