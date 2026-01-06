export interface CreateOutboxMessageDto {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    scheduledAt?: Date;
    maxRetries?: number;
}
//# sourceMappingURL=create-outbox-message.dto.d.ts.map