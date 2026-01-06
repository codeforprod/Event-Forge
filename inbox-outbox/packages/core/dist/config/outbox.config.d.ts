export interface OutboxConfig {
    pollingInterval?: number;
    batchSize?: number;
    maxRetries?: number;
    lockTimeoutSeconds?: number;
    backoffBaseSeconds?: number;
    maxBackoffSeconds?: number;
    cleanupInterval?: number;
    retentionDays?: number;
    immediateProcessing?: boolean;
    workerId?: string;
}
export declare const DEFAULT_OUTBOX_CONFIG: Required<OutboxConfig>;
//# sourceMappingURL=outbox.config.d.ts.map