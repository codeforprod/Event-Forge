import { CreateOutboxMessageDto } from './create-outbox-message.dto';
import { OutboxMessage } from './outbox-message.interface';

/**
 * Outbox Repository Interface
 * Defines operations for managing outbox messages in any database
 */
export interface IOutboxRepository {
  /**
   * Create a new outbox message
   * @param dto Message data
   * @param transactionContext Optional transaction context (TypeORM EntityManager, Mongoose Session, etc.)
   * @returns Created message
   */
  create(dto: CreateOutboxMessageDto, transactionContext?: unknown): Promise<OutboxMessage>;

  /**
   * Fetch and lock pending messages for processing
   * Uses database-specific locking (SKIP LOCKED for PostgreSQL, findOneAndUpdate for MongoDB)
   * @param limit Maximum number of messages to fetch
   * @param lockerId Unique identifier for this worker/process
   * @returns Array of locked messages
   */
  fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]>;

  /**
   * Mark a message as successfully published
   * @param id Message ID
   */
  markPublished(id: string): Promise<void>;

  /**
   * Mark a message as failed
   * @param id Message ID
   * @param error Error message
   * @param permanent If true, marks as permanently failed (no more retries)
   */
  markFailed(id: string, error: string, permanent?: boolean): Promise<void>;

  /**
   * Release a lock on a message
   * @param id Message ID
   */
  releaseLock(id: string): Promise<void>;

  /**
   * Release stale locks (messages locked longer than threshold)
   * @param olderThan Timestamp threshold
   * @returns Number of locks released
   */
  releaseStaleLocks(olderThan: Date): Promise<number>;

  /**
   * Delete old published messages
   * @param date Delete messages created before this date
   * @returns Number of deleted messages
   */
  deleteOlderThan(date: Date): Promise<number>;

  /**
   * Execute an operation within a transaction
   * @param operation Function to execute with transaction context
   * @returns Result of the operation
   */
  withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T>;
}
