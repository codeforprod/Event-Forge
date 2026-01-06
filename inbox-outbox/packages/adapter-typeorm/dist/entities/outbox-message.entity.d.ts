import { OutboxMessage, OutboxMessageStatus } from '@event-forge/inbox-outbox-core';
export declare class OutboxMessageEntity implements OutboxMessage {
    id: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    status: OutboxMessageStatus;
    retryCount: number;
    maxRetries: number;
    errorMessage?: string;
    scheduledAt?: Date;
    lockedBy?: string;
    lockedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=outbox-message.entity.d.ts.map