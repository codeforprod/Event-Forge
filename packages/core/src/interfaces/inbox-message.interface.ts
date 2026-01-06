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
}
