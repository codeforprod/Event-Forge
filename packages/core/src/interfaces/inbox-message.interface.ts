/**
 * Inbox Message Entity Interface
 * Represents a received message from external systems
 */
export interface InboxMessage {
  /** Unique identifier (database ID) */
  id: string;

  /** External message ID for deduplication */
  messageId: string;

  /** Source system/service that sent this message */
  source: string;

  /** Type of event received */
  eventType: string;

  /** Event payload data */
  payload: Record<string, unknown>;

  /** Current processing status */
  status: InboxMessageStatus;

  /** Timestamp when processing completed successfully */
  processedAt?: Date;

  /** Error message if processing failed */
  errorMessage?: string;

  /** Number of times processing has been retried */
  retryCount: number;

  /** Maximum number of retry attempts allowed */
  maxRetries: number;

  /** When the message should be retried (for delayed retry) */
  scheduledAt?: Date;

  /** Timestamp when the message was received */
  createdAt: Date;
}

/**
 * Inbox Message Status Enum
 */
export enum InboxMessageStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  PERMANENTLY_FAILED = 'permanently_failed',
}
