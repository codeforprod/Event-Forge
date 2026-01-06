export interface OutboxMessage {
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
export declare enum OutboxMessageStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    PUBLISHED = "published",
    FAILED = "failed",
    PERMANENTLY_FAILED = "permanently_failed"
}
//# sourceMappingURL=outbox-message.interface.d.ts.map