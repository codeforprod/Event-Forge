import { CreateOutboxMessageDto } from './create-outbox-message.dto';
import { OutboxMessage } from './outbox-message.interface';
export interface IOutboxRepository {
    create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;
    fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
    markPublished(id: string): Promise<void>;
    markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
    releaseLock(id: string): Promise<void>;
    releaseStaleLocks(olderThan: Date): Promise<number>;
    deleteOlderThan(date: Date): Promise<number>;
    withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
}
//# sourceMappingURL=outbox-repository.interface.d.ts.map