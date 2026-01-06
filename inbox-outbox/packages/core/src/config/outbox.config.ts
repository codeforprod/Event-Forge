/**
 * Outbox Service Configuration
 */
export interface OutboxConfig {
  /** Polling interval in milliseconds (default: 1000) */
  pollingInterval?: number;

  /** Batch size for fetching messages (default: 10) */
  batchSize?: number;

  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Lock timeout in seconds (default: 300 = 5 minutes) */
  lockTimeoutSeconds?: number;

  /** Exponential backoff base in seconds (default: 2) */
  backoffBaseSeconds?: number;

  /** Maximum backoff time in seconds (default: 3600 = 1 hour) */
  maxBackoffSeconds?: number;

  /** Cleanup interval for old messages in ms (default: 86400000 = 24 hours) */
  cleanupInterval?: number;

  /** Keep published messages for this many days (default: 7) */
  retentionDays?: number;

  /** Enable immediate processing on create (default: true) */
  immediateProcessing?: boolean;

  /** Unique worker ID (default: hostname + PID) */
  workerId?: string;
}

/**
 * Default Outbox Configuration
 */
export const DEFAULT_OUTBOX_CONFIG: Required<OutboxConfig> = {
  pollingInterval: 1000,
  batchSize: 10,
  maxRetries: 3,
  lockTimeoutSeconds: 300,
  backoffBaseSeconds: 2,
  maxBackoffSeconds: 3600,
  cleanupInterval: 86400000,
  retentionDays: 7,
  immediateProcessing: true,
  workerId: `${process.env.HOSTNAME || 'unknown'}-${process.pid}`,
};
