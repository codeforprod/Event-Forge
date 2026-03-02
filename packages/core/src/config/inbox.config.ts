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

  /** Exponential backoff base in seconds (default: 5) */
  backoffBaseSeconds?: number;

  /** Maximum backoff time in seconds (default: 3600 = 1 hour) */
  maxBackoffSeconds?: number;
}

/**
 * Default Inbox Configuration
 */
export const DEFAULT_INBOX_CONFIG: Required<InboxConfig> = {
  cleanupInterval: 86400000,
  retentionDays: 7,
  enableRetry: false,
  maxRetries: 3,
  backoffBaseSeconds: 5,
  maxBackoffSeconds: 3600,
};
