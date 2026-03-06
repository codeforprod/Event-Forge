import { CreateInboxMessageDto } from './create-inbox-message.dto';
import { InboxMessage } from './inbox-message.interface';

/**
 * Result of recording an inbox message
 */
export interface RecordInboxMessageResult {
  /** The inbox message (existing or newly created) */
  message: InboxMessage;

  /** True if this message was already received (duplicate) */
  isDuplicate: boolean;
}

/**
 * Inbox Repository Interface
 * Defines operations for managing inbox messages in any database
 */
export interface IInboxRepository {
  /**
   * Record a received message with deduplication
   * @param dto Message data
   * @returns Result with message and duplicate flag
   */
  record(dto: CreateInboxMessageDto): Promise<RecordInboxMessageResult>;

  /**
   * Check if a message already exists
   * @param messageId External message ID
   * @param source Source system
   * @returns True if message exists
   */
  exists(messageId: string, source: string): Promise<boolean>;

  /**
   * Mark a message as being processed (atomic status guard)
   * Only transitions from RECEIVED or FAILED to PROCESSING.
   * Returns false if the message is already in PROCESSING status (another consumer owns it).
   * @param id Message ID
   * @returns true if status transitioned successfully, false if already processing
   */
  markProcessing(id: string): Promise<boolean>;

  /**
   * Mark a message as successfully processed
   * @param id Message ID
   */
  markProcessed(id: string): Promise<void>;

  /**
   * Mark a message as failed
   * @param id Message ID
   * @param error Error message
   * @param permanent If true, marks as permanently failed (no more retries)
   * @param scheduledAt Optional timestamp for retry scheduling (backoff)
   */
  markFailed(id: string, error: string, permanent?: boolean, scheduledAt?: Date): Promise<void>;

  /**
   * Delete old processed messages
   * @param date Delete messages created before this date
   * @returns Number of deleted messages
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Find messages stuck in processing status beyond a timeout threshold
   * @param cutoffDate Messages with updatedAt before this date are considered stuck
   * @param limit Maximum number of messages to return
   * @returns List of stuck messages
   */
  findStuckProcessing?(cutoffDate: Date, limit: number): Promise<InboxMessage[]>;

  /**
   * Atomically reset a stuck processing message to failed for retry
   * Only updates if the message is still in PROCESSING status.
   * Increments recoveryAttempts and sets recovery metadata.
   * @param id Message ID
   * @param reason Recovery reason
   * @returns true if the message was actually reset
   */
  resetForRetry?(id: string, reason: string): Promise<boolean>;

  /**
   * Mark a stuck processing message as permanently failed (recovery exhausted)
   * @param id Message ID
   * @param reason Recovery reason
   */
  markPermanentlyFailedRecovery?(id: string, reason: string): Promise<void>;
}
