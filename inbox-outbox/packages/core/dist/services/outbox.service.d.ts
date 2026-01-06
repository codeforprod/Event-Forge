import { EventEmitter } from 'events';
import { OutboxConfig } from '../config/outbox.config';
import { CreateOutboxMessageDto } from '../interfaces/create-outbox-message.dto';
import { IMessagePublisher } from '../interfaces/message-publisher.interface';
import { OutboxMessage } from '../interfaces/outbox-message.interface';
import { IOutboxRepository } from '../interfaces/outbox-repository.interface';
export declare enum OutboxEvents {
    MESSAGE_CREATED = "outbox:message:created",
    MESSAGE_PUBLISHED = "outbox:message:published",
    MESSAGE_FAILED = "outbox:message:failed",
    POLLING_STARTED = "outbox:polling:started",
    POLLING_STOPPED = "outbox:polling:stopped"
}
export declare class OutboxService extends EventEmitter {
    private readonly repository;
    private readonly publisher;
    private readonly config;
    private pollingTimer?;
    private cleanupTimer?;
    private isProcessing;
    constructor(repository: IOutboxRepository, publisher: IMessagePublisher, config?: OutboxConfig);
    createMessage(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;
    withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
    startPolling(): void;
    stopPolling(): void;
    processMessage(_messageId: string): Promise<void>;
    private pollAndProcess;
    private publishMessage;
    private handlePublishError;
    private startCleanup;
    private cleanup;
}
//# sourceMappingURL=outbox.service.d.ts.map