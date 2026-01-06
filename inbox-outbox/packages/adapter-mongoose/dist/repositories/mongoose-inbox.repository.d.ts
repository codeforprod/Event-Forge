import { Model } from 'mongoose';
import { CreateInboxMessageDto, IInboxRepository, RecordInboxMessageResult } from '@event-forge/inbox-outbox-core';
import { InboxMessageDocument } from '../schemas/inbox-message.schema';
export declare class MongooseInboxRepository implements IInboxRepository {
    private readonly model;
    constructor(model: Model<InboxMessageDocument>);
    record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult>;
    exists(messageId: string, source: string): Promise<boolean>;
    markProcessing(id: string): Promise<void>;
    markProcessed(id: string): Promise<void>;
    markFailed(id: string, error: string): Promise<void>;
    deleteOlderThan(date: Date): Promise<number>;
    private toInboxMessage;
}
//# sourceMappingURL=mongoose-inbox.repository.d.ts.map