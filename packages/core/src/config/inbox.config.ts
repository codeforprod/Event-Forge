/**
 * Inbox Service Configuration
 */
export interface InboxConfig {
  /** Cleanup interval for old messages in ms (default: 86400000 = 24 hours) */
  cleanupInterval?: number;

  /** Keep processed messages for this many days (default: 7) */
  retentionDays?: number;

  /** Enable retry mechanism for failed messages (default: false) */
  enableRetry?: boolean;

  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;

  /** Polling interval for retryable messages in milliseconds (default: 5000) */
  retryPollingInterval?: number;

  /** Exponential backoff base in seconds (default: 2) */
  backoffBaseSeconds?: number;

  /** Maximum backoff time in seconds (default: 3600 = 1 hour) */
  maxBackoffSeconds?: number;

  /** Batch size for fetching retryable messages (default: 10) */
  retryBatchSize?: number;

  /** Unique worker ID for retry processing (default: hostname + PID) */
  retryWorkerId?: string;
}

/**
 * Default Inbox Configuration
 */
export const DEFAULT_INBOX_CONFIG: Required<InboxConfig> = {
  cleanupInterval: 86400000,
  retentionDays: 7,
  enableRetry: false,
  maxRetries: 3,
  retryPollingInterval: 5000,
  backoffBaseSeconds: 2,
  maxBackoffSeconds: 3600,
  retryBatchSize: 10,
  retryWorkerId: `${process.env.HOSTNAME || 'unknown'}-${process.pid}`,
};
