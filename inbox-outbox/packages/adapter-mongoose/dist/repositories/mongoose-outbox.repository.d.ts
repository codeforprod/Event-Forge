import { Connection, Model } from 'mongoose';
import { CreateOutboxMessageDto, IOutboxRepository, OutboxMessage } from '@event-forge/inbox-outbox-core';
import { OutboxMessageDocument } from '../schemas/outbox-message.schema';
export declare class MongooseOutboxRepository implements IOutboxRepository {
    private readonly connection;
    private readonly model;
    constructor(connection: Connection, model: Model<OutboxMessageDocument>);
    create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;
    fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;
    markPublished(id: string): Promise<void>;
    markFailed(id: string, error: string, permanent?: boolean): Promise<void>;
    releaseLock(id: string): Promise<void>;
    releaseStaleLocks(olderThan: Date): Promise<number>;
    deleteOlderThan(date: Date): Promise<number>;
    withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
    private toOutboxMessage;
}
//# sourceMappingURL=mongoose-outbox.repository.d.ts.map