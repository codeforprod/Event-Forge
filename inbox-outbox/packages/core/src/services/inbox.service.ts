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
}

/**
 * Inbox Service
 * Manages inbox message reception, deduplication, and processing
 */
export class InboxService extends EventEmitter {
  private readonly config: Required<InboxConfig>;
  private readonly handlers = new Map<string, MessageHandler[]>();
  private cleanupTimer?: NodeJS.Timeout;

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

      // Execute all handlers
      await Promise.all(handlers.map((handler) => handler(message)));

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

    // Mark as failed
    await this.repository.markFailed(message.id, errorMessage);
    this.emit(InboxEvents.MESSAGE_FAILED, { message, error });

    // Re-throw ProcessingError (permanent failure)
    if (error instanceof ProcessingError) {
      throw error;
    }

    // For other errors, wrap in generic error
    throw new Error(`Failed to process inbox message ${message.id}: ${errorMessage}`);
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
