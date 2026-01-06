/**
 * Outbox Message Entity Interface
 * Represents a message to be published to external systems
 */
export interface OutboxMessage {
  /** Unique identifier for the message */
  id: string;

  /** Type of the aggregate (entity) that generated this event */
  aggregateType: string;

  /** ID of the specific aggregate instance */
  aggregateId: string;

  /** Type of event being published */
  eventType: string;

  /** Event payload data */
  payload: Record<string, unknown>;

  /** Optional metadata for routing, correlation, etc. */
  metadata?: Record<string, unknown>;

  /** Current processing status */
  status: OutboxMessageStatus;

  /** Number of times processing has been retried */
  retryCount: number;

  /** Maximum number of retry attempts allowed */
  maxRetries: number;

  /** Error message from last failed attempt */
  errorMessage?: string;

  /** When the message should be processed (for delayed messages) */
  scheduledAt?: Date;

  /** ID of the worker/process that locked this message */
  lockedBy?: string;

  /** Timestamp when the message was locked */
  lockedAt?: Date;

  /** Timestamp when the message was created */
  createdAt: Date;

  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * Outbox Message Status Enum
 */
export enum OutboxMessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  PERMANENTLY_FAILED = 'permanently_failed',
}
