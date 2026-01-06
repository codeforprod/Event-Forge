import { EventEmitter } from 'events';

import { DEFAULT_OUTBOX_CONFIG, OutboxConfig } from '../config/outbox.config';
import { ProcessingError } from '../errors/processing.error';
import { CreateOutboxMessageDto } from '../interfaces/create-outbox-message.dto';
import { IMessagePublisher } from '../interfaces/message-publisher.interface';
import { OutboxMessage } from '../interfaces/outbox-message.interface';
import { IOutboxRepository } from '../interfaces/outbox-repository.interface';

/**
 * Outbox Service Events
 */
export enum OutboxEvents {
  MESSAGE_CREATED = 'outbox:message:created',
  MESSAGE_PUBLISHED = 'outbox:message:published',
  MESSAGE_FAILED = 'outbox:message:failed',
  POLLING_STARTED = 'outbox:polling:started',
  POLLING_STOPPED = 'outbox:polling:stopped',
}

/**
 * Outbox Service
 * Manages outbox message creation, polling, and publishing
 */
export class OutboxService extends EventEmitter {
  private readonly config: Required<OutboxConfig>;
  private pollingTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isProcessing = false;

  constructor(
    private readonly repository: IOutboxRepository,
    private readonly publisher: IMessagePublisher,
    config?: OutboxConfig,
  ) {
    super();
    this.config = { ...DEFAULT_OUTBOX_CONFIG, ...config };
  }

  /**
   * Create a new outbox message
   * Optionally within a transaction context
   */
  async createMessage(
    dto: CreateOutboxMessageDto,
    transactionContext?: unknown,
  ): Promise<OutboxMessage> {
    const message = await this.repository.create(
      {
        ...dto,
        maxRetries: dto.maxRetries ?? this.config.maxRetries,
      },
      transactionContext,
    );

    // Emit event for immediate processing
    if (this.config.immediateProcessing) {
      this.emit(OutboxEvents.MESSAGE_CREATED, message.id);
    }

    return message;
  }

  /**
   * Execute operation within a transaction
   */
  async withTransaction<T>(operation: (context: unknown) => Promise<T>): Promise<T> {
    return this.repository.withTransaction(operation);
  }

  /**
   * Start polling for pending messages
   */
  startPolling(): void {
    if (this.pollingTimer) {
      return;
    }

    this.emit(OutboxEvents.POLLING_STARTED);
    this.pollingTimer = setInterval(() => {
      void this.pollAndProcess();
    }, this.config.pollingInterval);

    // Initial poll
    void this.pollAndProcess();

    // Start cleanup timer
    this.startCleanup();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
      this.emit(OutboxEvents.POLLING_STOPPED);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Process a specific message immediately
   */
  async processMessage(_messageId: string): Promise<void> {
    // This will be called via EventEmitter when a message is created
    // We'll poll immediately to pick it up
    await this.pollAndProcess();
  }

  /**
   * Poll for pending messages and process them
   */
  private async pollAndProcess(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Release stale locks first
      const lockTimeout = new Date(Date.now() - this.config.lockTimeoutSeconds * 1000);
      await this.repository.releaseStaleLocks(lockTimeout);

      // Fetch and lock pending messages
      const messages = await this.repository.fetchAndLockPending(
        this.config.batchSize,
        this.config.workerId,
      );

      // Process each message
      await Promise.all(messages.map((message) => this.publishMessage(message)));
    } catch (error) {
      // Log error but don't stop polling
      this.emit('error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Publish a single message
   */
  private async publishMessage(message: OutboxMessage): Promise<void> {
    try {
      // Publish to message broker
      await this.publisher.publish(message);

      // Mark as published
      await this.repository.markPublished(message.id);

      this.emit(OutboxEvents.MESSAGE_PUBLISHED, message);
    } catch (error) {
      await this.handlePublishError(message, error);
    }
  }

  /**
   * Handle publishing error with retry logic
   */
  private async handlePublishError(message: OutboxMessage, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPermanent = error instanceof ProcessingError;

    // Check if we've exceeded max retries
    if (message.retryCount >= message.maxRetries || isPermanent) {
      await this.repository.markFailed(message.id, errorMessage, true);
      this.emit(OutboxEvents.MESSAGE_FAILED, { message, error, permanent: true });
      return;
    }

    // Mark as failed (will be retried)
    await this.repository.markFailed(message.id, errorMessage, false);
    this.emit(OutboxEvents.MESSAGE_FAILED, { message, error, permanent: false });
  }

  /**
   * Start cleanup timer for old messages
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.config.cleanupInterval);

    // Initial cleanup
    void this.cleanup();
  }

  /**
   * Clean up old published messages
   */
  private async cleanup(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
      const deleted = await this.repository.deleteOlderThan(cutoffDate);

      if (deleted > 0) {
        this.emit('cleanup', { deleted, cutoffDate });
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

}
