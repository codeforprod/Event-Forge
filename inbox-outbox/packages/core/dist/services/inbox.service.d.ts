import { EventEmitter } from 'events';
import { InboxConfig } from '../config/inbox.config';
import { CreateInboxMessageDto } from '../interfaces/create-inbox-message.dto';
import { InboxMessage } from '../interfaces/inbox-message.interface';
import { IInboxRepository } from '../interfaces/inbox-repository.interface';
export type MessageHandler = (message: InboxMessage) => Promise<void> | void;
export declare enum InboxEvents {
    MESSAGE_RECEIVED = "inbox:message:received",
    MESSAGE_DUPLICATE = "inbox:message:duplicate",
    MESSAGE_PROCESSED = "inbox:message:processed",
    MESSAGE_FAILED = "inbox:message:failed"
}
export declare class InboxService extends EventEmitter {
    private readonly repository;
    private readonly config;
    private readonly handlers;
    private cleanupTimer?;
    constructor(repository: IInboxRepository, config?: InboxConfig);
    registerHandler(eventType: string, handler: MessageHandler): void;
    unregisterHandler(eventType: string, handler: MessageHandler): void;
    receiveMessage(dto: CreateInboxMessageDto): Promise<void>;
    processMessage(message: InboxMessage): Promise<void>;
    private handleProcessingError;
    startCleanup(): void;
    stopCleanup(): void;
    private cleanup;
}
//# sourceMappingURL=inbox.service.d.ts.map