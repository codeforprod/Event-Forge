/**
 * Inbox Service Configuration
 */
export interface InboxConfig {
  /** Cleanup interval for old messages in ms (default: 86400000 = 24 hours) */
  cleanupInterval?: number;

  /** Keep processed messages for this many days (default: 7) */
  retentionDays?: number;
}

/**
 * Default Inbox Configuration
 */
export const DEFAULT_INBOX_CONFIG: Required<InboxConfig> = {
  cleanupInterval: 86400000,
  retentionDays: 7,
};
