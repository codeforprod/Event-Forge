import { DataSource } from 'typeorm';
import { CreateInboxMessageDto, IInboxRepository, RecordInboxMessageResult } from '@event-forge/inbox-outbox-core';
export declare class TypeOrmInboxRepository implements IInboxRepository {
    private readonly repository;
    constructor(dataSource: DataSource);
    record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult>;
    exists(messageId: string, source: string): Promise<boolean>;
    markProcessing(id: string): Promise<void>;
    markProcessed(id: string): Promise<void>;
    markFailed(id: string, error: string): Promise<void>;
    deleteOlderThan(date: Date): Promise<number>;
}
//# sourceMappingURL=typeorm-inbox.repository.d.ts.map