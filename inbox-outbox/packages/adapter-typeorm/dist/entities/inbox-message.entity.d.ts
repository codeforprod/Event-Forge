import { InboxMessage, InboxMessageStatus } from '@event-forge/inbox-outbox-core';
export declare class InboxMessageEntity implements InboxMessage {
    id: string;
    messageId: string;
    source: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: InboxMessageStatus;
    processedAt?: Date;
    errorMessage?: string;
    createdAt: Date;
}
//# sourceMappingURL=inbox-message.entity.d.ts.map