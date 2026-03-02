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
  PROCESSOR_STARTED = 'outbox:processor:started',
  PROCESSOR_STOPPED = 'outbox:processor:stopped',
  /** @deprecated Use PROCESSOR_STARTED */
  POLLING_STARTED = 'outbox:polling:started',
  /** @deprecated Use PROCESSOR_STOPPED */
  POLLING_STOPPED = 'outbox:polling:stopped',
}

/**
 * Outbox Service
 * Manages outbox message creation, event-driven publishing, and safety-net polling
 */
export class OutboxService extends EventEmitter {
  private readonly config: Required<OutboxConfig>;
  private safetyNetTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isProcessing = false;
  private retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly repository: IOutboxRepository,
    private readonly publisher: IMessagePublisher,
    config?: OutboxConfig,
  ) {
    super();
    this.config = {
      ...DEFAULT_OUTBOX_CONFIG,
      ...config,
      safetyNetInterval: config?.safetyNetInterval ?? config?.pollingInterval ?? DEFAULT_OUTBOX_CONFIG.safetyNetInterval,
    };
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
   * Start the event-driven processor
   * - Listens for MESSAGE_CREATED events for immediate publish
   * - Runs a low-frequency safety net poll for crash recovery
   */
  startProcessor(): void {
    if (this.safetyNetTimer) {
      return;
    }

    // Event-driven: immediate publish on create
    this.on(OutboxEvents.MESSAGE_CREATED, (id: string) => {
      void this.processMessageById(id);
    });

    // Safety net: low-frequency poll for crash recovery
    this.safetyNetTimer = setInterval(() => {
      void this.pollAndProcess();
    }, this.config.safetyNetInterval);

    this.startCleanup();

    this.emit(OutboxEvents.PROCESSOR_STARTED);
    this.emit(OutboxEvents.POLLING_STARTED);
  }

  /**
   * Stop the processor
   */
  stopProcessor(): void {
    if (this.safetyNetTimer) {
      clearInterval(this.safetyNetTimer);
      this.safetyNetTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Clear all retry timers
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    // Remove MESSAGE_CREATED listeners added by startProcessor
    this.removeAllListeners(OutboxEvents.MESSAGE_CREATED);

    this.emit(OutboxEvents.PROCESSOR_STOPPED);
    this.emit(OutboxEvents.POLLING_STOPPED);
  }

  /**
   * @deprecated Use startProcessor() instead
   */
  startPolling(): void {
    this.startProcessor();
  }

  /**
   * @deprecated Use stopProcessor() instead
   */
  stopPolling(): void {
    this.stopProcessor();
  }

  /**
   * Process a specific message by ID (event-driven path)
   */
  async processMessageById(id: string): Promise<void> {
    try {
      const message = await this.repository.findAndLockById(id, this.config.workerId);
      if (!message) return;
      await this.publishMessage(message);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Process a specific message immediately
   * @deprecated This method polls all pending messages. Use processMessageById() instead.
   */
  async processMessage(_messageId: string): Promise<void> {
    await this.pollAndProcess();
  }

  /**
   * Poll for pending messages and process them (safety net)
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

      //Guard against undefined/null
      if (!messages || messages.length === 0) {
        return;
      }

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

    // Calculate exponential backoff with jitter
    const backoffDelay = this.calculateBackoff(message.retryCount);
    const scheduledAt = new Date(Date.now() + backoffDelay);

    // Mark as failed with scheduled retry
    await this.repository.markFailed(message.id, errorMessage, false, scheduledAt);
    this.emit(OutboxEvents.MESSAGE_FAILED, { message, error, permanent: false });

    // Schedule retry via setTimeout (event-driven retry)
    const timer = setTimeout(() => {
      this.retryTimers.delete(message.id);
      void this.processMessageById(message.id);
    }, backoffDelay);
    this.retryTimers.set(message.id, timer);
  }

  /**
   * Calculate exponential backoff delay in milliseconds
   * Formula: min(backoffBaseSeconds * 2^retryCount, maxBackoffSeconds) + jitter
   */
  private calculateBackoff(retryCount: number): number {
    const baseDelaySeconds = this.config.backoffBaseSeconds;
    const maxDelaySeconds = this.config.maxBackoffSeconds;

    // Exponential backoff: base * 2^retryCount
    const exponentialDelay = baseDelaySeconds * Math.pow(2, retryCount);

    // Apply max limit
    const cappedDelay = Math.min(exponentialDelay, maxDelaySeconds);

    // Add jitter (±10% randomization to prevent thundering herd)
    const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
    const finalDelay = cappedDelay + jitter;

    // Convert to milliseconds
    return Math.max(0, finalDelay * 1000);
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
