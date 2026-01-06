export interface InboxMessage {
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
export declare enum InboxMessageStatus {
    RECEIVED = "received",
    PROCESSING = "processing",
    PROCESSED = "processed",
    FAILED = "failed"
}
//# sourceMappingURL=inbox-message.interface.d.ts.map