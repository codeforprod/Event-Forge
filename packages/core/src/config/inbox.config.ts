/**
 * Recovery configuration for stuck processing messages
 */
export interface InboxRecoveryConfig {
  /** Enable recovery sweep (default: true) */
  enabled?: boolean;

  /** Sweep interval in ms (default: 60000 = 1 min) */
  intervalMs?: number;

  /** Processing timeout threshold in ms (default: 300000 = 5 min) */
  processingTimeoutMs?: number;

  /** Maximum recovery attempts before permanent failure (default: 3) */
  maxRecoveryAttempts?: number;

  /** Action for stuck messages: 'retry' resets + re-publishes, 'fail' marks permanently failed (default: 'retry') */
  action?: 'retry' | 'fail';
}

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

  /** Recovery configuration for stuck processing messages */
  recovery?: InboxRecoveryConfig;
}

/**
 * Default Recovery Configuration
 */
export const DEFAULT_RECOVERY_CONFIG: Required<InboxRecoveryConfig> = {
  enabled: true,
  intervalMs: 60_000,
  processingTimeoutMs: 300_000,
  maxRecoveryAttempts: 3,
  action: 'retry',
};

/**
 * Default Inbox Configuration
 */
export const DEFAULT_INBOX_CONFIG: Required<Omit<InboxConfig, 'recovery'>> & { recovery: Required<InboxRecoveryConfig> } = {
  cleanupInterval: 86400000,
  retentionDays: 7,
  enableRetry: false,
  maxRetries: 3,
  backoffBaseSeconds: 5,
  maxBackoffSeconds: 3600,
  recovery: DEFAULT_RECOVERY_CONFIG,
};
