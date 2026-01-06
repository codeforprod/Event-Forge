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
   * Mark a message as being processed
   * @param id Message ID
   */
  markProcessing(id: string): Promise<void>;

  /**
   * Mark a message as successfully processed
   * @param id Message ID
   */
  markProcessed(id: string): Promise<void>;

  /**
   * Mark a message as failed
   * @param id Message ID
   * @param error Error message
   */
  markFailed(id: string, error: string): Promise<void>;

  /**
   * Delete old processed messages
   * @param date Delete messages created before this date
   * @returns Number of deleted messages
   */
  deleteOlderThan(date: Date): Promise<number>;
}
