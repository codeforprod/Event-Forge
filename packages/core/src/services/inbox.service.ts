import { EventEmitter } from 'events';

import { DEFAULT_INBOX_CONFIG, InboxConfig } from '../config/inbox.config';
import { DuplicateMessageError } from '../errors/duplicate-message.error';
import { ProcessingError } from '../errors/processing.error';
import { CreateInboxMessageDto } from '../interfaces/create-inbox-message.dto';
import { InboxMessage } from '../interfaces/inbox-message.interface';
import { IInboxRepository } from '../interfaces/inbox-repository.interface';

/**
 * Message Handler Function
 */
export type MessageHandler = (
  message: InboxMessage,
) => Promise<void> | void;

/**
 * Inbox Service Events
 */
export enum InboxEvents {
  MESSAGE_RECEIVED = 'inbox:message:received',
  MESSAGE_DUPLICATE = 'inbox:message:duplicate',
  MESSAGE_PROCESSED = 'inbox:message:processed',
  MESSAGE_FAILED = 'inbox:message:failed',
  RETRY_POLLING_STARTED = 'inbox:retry:polling:started',
  RETRY_POLLING_STOPPED = 'inbox:retry:polling:stopped',
}

/**
 * Inbox Service
 * Manages inbox message reception, deduplication, and processing
 */
export class InboxService extends EventEmitter {
  private readonly config: Required<InboxConfig>;
  private readonly handlers = new Map<string, MessageHandler[]>();
  private cleanupTimer?: NodeJS.Timeout;
  private retryPollingTimer?: NodeJS.Timeout;
  private isProcessingRetries = false;

  constructor(
    private readonly repository: IInboxRepository,
    config?: InboxConfig,
  ) {
    super();
    this.config = { ...DEFAULT_INBOX_CONFIG, ...config };
  }

  /**
   * Register a handler for a specific event type
   */
  registerHandler(eventType: string, handler: MessageHandler): void {
    const existingHandlers = this.handlers.get(eventType) || [];
    existingHandlers.push(handler);
    this.handlers.set(eventType, existingHandlers);
  }

  /**
   * Unregister a handler for a specific event type
   */
  unregisterHandler(eventType: string, handler: MessageHandler): void {
    const existingHandlers = this.handlers.get(eventType);

    if (!existingHandlers) {
      return;
    }

    const index = existingHandlers.indexOf(handler);
    if (index > -1) {
      existingHandlers.splice(index, 1);
    }

    if (existingHandlers.length === 0) {
      this.handlers.delete(eventType);
    }
  }

  /**
   * Receive and process a message
   * Handles deduplication automatically
   */
  async receiveMessage(dto: CreateInboxMessageDto): Promise<void> {
    // Record message with deduplication
    const result = await this.repository.record(dto);

    if (result.isDuplicate) {
      this.emit(InboxEvents.MESSAGE_DUPLICATE, result.message);
      throw new DuplicateMessageError(dto.messageId, dto.source);
    }

    this.emit(InboxEvents.MESSAGE_RECEIVED, result.message);

    // Process the message
    await this.processMessage(result.message);
  }

  /**
   * Process a message using registered handlers
   */
  async processMessage(message: InboxMessage): Promise<void> {
    const handlers = this.handlers.get(message.eventType);

    if (!handlers || handlers.length === 0) {
      // No handlers registered - mark as processed anyway
      await this.repository.markProcessed(message.id);
      this.emit(InboxEvents.MESSAGE_PROCESSED, message);
      return;
    }

    try {
      // Mark as processing
      await this.repository.markProcessing(message.id);

      // Execute all handlers and collect results
      const results = await Promise.allSettled(
        handlers.map((handler) => handler(message)),
      );

      // Check if any handler failed
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (failures.length > 0) {
        // Get first failure reason
        throw failures[0].reason;
      }

      // Mark as processed
      await this.repository.markProcessed(message.id);
      this.emit(InboxEvents.MESSAGE_PROCESSED, message);
    } catch (error) {
      await this.handleProcessingError(message, error);
    }
  }

  /**
   * Handle processing error
   */
  private async handleProcessingError(message: InboxMessage, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPermanent = error instanceof ProcessingError;

    // Check if we've exceeded max retries
    if (message.retryCount >= message.maxRetries || isPermanent) {
      await this.repository.markFailed(message.id, errorMessage, true);
      this.emit(InboxEvents.MESSAGE_FAILED, { message, error, permanent: true });

      // Re-throw ProcessingError
      if (isPermanent) {
        throw error;
      }

      throw new Error(`Failed to process inbox message ${message.id} after ${message.maxRetries} retries: ${errorMessage}`);
    }

    // Calculate exponential backoff with jitter (only if retry is enabled)
    let scheduledAt: Date | undefined;
    if (this.config.enableRetry) {
      const backoffDelay = this.calculateBackoff(message.retryCount);
      scheduledAt = new Date(Date.now() + backoffDelay);
    }

    // Mark as failed with optional scheduled retry
    await this.repository.markFailed(message.id, errorMessage, false, scheduledAt);
    this.emit(InboxEvents.MESSAGE_FAILED, { message, error, permanent: false });

    throw new Error(`Failed to process inbox message ${message.id}: ${errorMessage}`);
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
   * Start retry polling for failed messages
   * Only active if enableRetry is true
   */
  startRetryPolling(): void {
    if (!this.config.enableRetry) {
      return;
    }

    if (this.retryPollingTimer) {
      return;
    }

    this.emit(InboxEvents.RETRY_POLLING_STARTED);
    this.retryPollingTimer = setInterval(() => {
      void this.pollAndRetry();
    }, this.config.retryPollingInterval);

    // Initial poll
    void this.pollAndRetry();
  }

  /**
   * Stop retry polling
   */
  stopRetryPolling(): void {
    if (this.retryPollingTimer) {
      clearInterval(this.retryPollingTimer);
      this.retryPollingTimer = undefined;
      this.emit(InboxEvents.RETRY_POLLING_STOPPED);
    }
  }

  /**
   * Poll for retryable messages and process them
   */
  private async pollAndRetry(): Promise<void> {
    if (this.isProcessingRetries) {
      return;
    }

    this.isProcessingRetries = true;

    try {
      // Fetch retryable messages
      const messages = await this.repository.findRetryable(this.config.retryBatchSize);

      if (!messages || messages.length === 0) {
        return;
      }

      // Process each message - use allSettled to continue processing even if some fail
      await Promise.allSettled(messages.map((message) => this.processMessage(message)));
    } catch (error) {
      // Log error but don't stop polling
      this.emit('error', error);
    } finally {
      this.isProcessingRetries = false;
    }
  }

  /**
   * Start cleanup timer for old messages
   */
  startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.config.cleanupInterval);

    // Initial cleanup
    void this.cleanup();
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clean up old processed messages
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
