export interface OutboxConfig {
    /**
     * Polling interval in milliseconds (default: 1000)
     */
    pollingInterval?: number;
    /**
     * Number of messages to fetch in each batch (default: 10)
     */
    batchSize?: number;
    /**
     * Maximum number of retries for failed messages (default: 5)
     */
    maxRetries?: number;
    /**
     * Lock timeout in milliseconds (default: 30000)
     */
    lockTimeout?: number;
    /**
     * Number of days to keep published messages (default: 7)
     */
    cleanupAfterDays?: number;
}
export interface InboxConfig {
    /**
     * Number of days to keep processed messages (default: 7)
     */
    cleanupAfterDays?: number;
}
export interface InboxOutboxConfig {
    outbox?: OutboxConfig;
    inbox?: InboxConfig;
}
export declare const INBOX_OUTBOX_CONFIG: unique symbol;
export declare const DEFAULT_CONFIG: Required<InboxOutboxConfig>;
//# sourceMappingURL=inbox-outbox.config.d.ts.map