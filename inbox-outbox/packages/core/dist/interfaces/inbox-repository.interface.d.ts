import { CreateInboxMessageDto } from './create-inbox-message.dto';
import { InboxMessage } from './inbox-message.interface';
export interface RecordInboxMessageResult {
    message: InboxMessage;
    isDuplicate: boolean;
}
export interface IInboxRepository {
    record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult>;
    exists(messageId: string, source: string): Promise<boolean>;
    markProcessing(id: string): Promise<void>;
    markProcessed(id: string): Promise<void>;
    markFailed(id: string, error: string): Promise<void>;
    deleteOlderThan(date: Date): Promise<number>;
}
//# sourceMappingURL=inbox-repository.interface.d.ts.map