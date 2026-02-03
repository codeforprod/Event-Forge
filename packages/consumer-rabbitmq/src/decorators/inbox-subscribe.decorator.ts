import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ModuleRef } from '@nestjs/core';
import {
  IInboxRepository,
  InboxMessage,
  InboxService,
  InboxEvents,
  ProcessingError,
} from '@prodforcode/event-forge-core';
import { INBOX_SERVICE } from '@prodforcode/event-forge-nestjs';

import { InboxSubscribeOptions } from '../interfaces/inbox-consumer-options.interface';
import { RabbitMQMessage } from '../interfaces/rabbitmq-message.interface';

/**
 * Metadata key for storing InboxSubscribe configuration
 */
export const INBOX_SUBSCRIBE_METADATA = 'inbox:subscribe';

/**
 * Module reference for lazy injection of IInboxRepository
 * This is set by InboxConsumerModule during initialization
 */
let moduleRef: ModuleRef | null = null;

/**
 * Logger configuration
 */
let logDuplicates = true;

/**
 * Initialize the decorator with ModuleRef
 * Called by InboxConsumerModule.onModuleInit()
 */
export function setModuleRef(ref: ModuleRef, options?: { logDuplicates?: boolean }): void {
  moduleRef = ref;
  if (options?.logDuplicates !== undefined) {
    logDuplicates = options.logDuplicates;
  }
}

/**
 * Extract message ID from message with priority-based extraction
 */
function extractMessageId(
  message: RabbitMQMessage,
  options: InboxSubscribeOptions,
): string {
  // Priority 1: Custom extractor (highest priority)
  if (options.messageIdExtractor) {
    return options.messageIdExtractor(message);
  }

  // Priority 2: EventForge format - message body with id field
  const messageRecord = message as Record<string, unknown>;
  if (messageRecord.id && typeof messageRecord.id === 'string') {
    return messageRecord.id;
  }

  // Priority 3: Raw AMQP message with properties.messageId
  if (message.properties?.messageId) {
    return String(message.properties.messageId);
  }

  throw new Error(
    'Unable to extract message ID. Provide messageIdExtractor, ensure message body has id field, or message has properties.messageId.',
  );
}

/**
 * Extract source identifier from options
 */
function extractSource(options: InboxSubscribeOptions): string {
  if (!options.source) {
    throw new Error(
      'Source identifier is required. Set source in @InboxSubscribe decorator options.',
    );
  }

  return options.source;
}

/**
 * Extract event type from message with fallback logic
 */
function extractEventType(
  message: RabbitMQMessage,
  options: InboxSubscribeOptions,
): string {
  // Priority 1: Custom extractor
  if (options.eventTypeExtractor) {
    return options.eventTypeExtractor(message);
  }

  // Priority 2: Message properties.type
  if (message.properties?.type) {
    return String(message.properties.type);
  }

  // Priority 3: First routing key
  if (typeof options.routingKey === 'string') {
    return options.routingKey;
  }

  if (Array.isArray(options.routingKey) && options.routingKey.length > 0) {
    return options.routingKey[0];
  }

  return 'unknown';
}

/**
 * Default backoff configuration
 */
const DEFAULT_BACKOFF_CONFIG = {
  backoffBaseSeconds: 5,
  maxBackoffSeconds: 3600,
};

/**
 * Calculate exponential backoff delay in milliseconds
 * Formula: min(backoffBaseSeconds * 2^retryCount, maxBackoffSeconds) + jitter
 */
function calculateBackoff(
  retryCount: number,
  config: { backoffBaseSeconds?: number; maxBackoffSeconds?: number } = {},
): number {
  const baseDelaySeconds = config.backoffBaseSeconds ?? DEFAULT_BACKOFF_CONFIG.backoffBaseSeconds;
  const maxDelaySeconds = config.maxBackoffSeconds ?? DEFAULT_BACKOFF_CONFIG.maxBackoffSeconds;

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
 * Handle errors from the decorated handler with retry logic
 * Updates INBOX record status, error_message, and schedules retry if applicable
 */
async function handleDecoratorError(
  inboxRepository: IInboxRepository,
  inboxService: InboxService | null,
  message: InboxMessage,
  error: unknown,
  options: InboxSubscribeOptions,
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isPermanent = error instanceof ProcessingError;

  // Use maxRetries from options if provided, otherwise use message default
  const maxRetries = options.maxRetries ?? message.maxRetries;

  // Check if we've exceeded max retries or error is permanent
  if (message.retryCount >= maxRetries || isPermanent) {
    await inboxRepository.markFailed(message.id, errorMessage, true);

    // Emit event if InboxService is available
    if (inboxService) {
      inboxService.emit(InboxEvents.MESSAGE_FAILED, {
        message,
        error: errorMessage,
        permanent: true,
      });
    }

    console.error(
      `[InboxSubscribe] Message ${message.messageId} permanently failed after ${message.retryCount} retries: ${errorMessage}`,
    );
    return;
  }

  // Calculate exponential backoff for retry
  const enableRetry = options.enableRetry ?? true;
  let scheduledAt: Date | undefined;

  if (enableRetry) {
    const backoffDelay = calculateBackoff(message.retryCount, {
      backoffBaseSeconds: options.backoffBaseSeconds,
      maxBackoffSeconds: options.maxBackoffSeconds,
    });
    scheduledAt = new Date(Date.now() + backoffDelay);
  }

  // Mark as failed with optional scheduled retry
  await inboxRepository.markFailed(message.id, errorMessage, false, scheduledAt);

  // Emit event if InboxService is available
  if (inboxService) {
    inboxService.emit(InboxEvents.MESSAGE_FAILED, {
      message,
      error: errorMessage,
      permanent: false,
      scheduledAt,
    });
  }

  console.error(
    `[InboxSubscribe] Message ${message.messageId} failed (retry ${message.retryCount + 1}/${maxRetries}): ${errorMessage}`,
    scheduledAt ? `Scheduled retry at ${scheduledAt.toISOString()}` : 'No retry scheduled',
  );
}

/**
 * Decorator that combines RabbitMQ subscription with automatic INBOX recording
 *
 * This decorator wraps @RabbitSubscribe from @golevelup/nestjs-rabbitmq
 * and adds automatic inbox message recording for idempotency.
 *
 * The key difference from the previous implementation is that the wrapping
 * happens INSIDE the decorator at the prototype level (descriptor.value)
 * BEFORE applying @RabbitSubscribe. This ensures that @golevelup/nestjs-rabbitmq
 * discovers and registers the WRAPPED handler, not the original one.
 *
 * @example
 * ```typescript
 * @InboxSubscribe({
 *   exchange: 'events',
 *   routingKey: 'user.created',
 *   source: 'user-service',
 * })
 * async handleUserCreated(message: RabbitMQMessage) {
 *   // Message is automatically recorded in inbox before this handler is called
 *   // Duplicate messages are automatically filtered out
 *   console.log('User created:', message);
 * }
 * ```
 *
 * @param options - Configuration for the subscription and inbox behavior
 */
export function InboxSubscribe(
  options: InboxSubscribeOptions,
): MethodDecorator {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    // CRITICAL: Wrap the method BEFORE applying @RabbitSubscribe
    // This ensures @golevelup/nestjs-rabbitmq discovers the WRAPPED handler
    descriptor.value = async function wrappedInboxHandler(
      ...args: unknown[]
    ): Promise<unknown> {
      if (!moduleRef) {
        throw new Error(
          'InboxConsumerModule not initialized. Ensure InboxConsumerModule.forRoot() is imported in your app module.',
        );
      }

      // Get IInboxRepository from DI container
      const inboxRepository = moduleRef.get<IInboxRepository>(
        'IInboxRepository',
        { strict: false },
      );

      if (!inboxRepository) {
        throw new Error(
          'IInboxRepository not found. Ensure an inbox repository adapter (TypeORM/Mongoose) is registered.',
        );
      }

      const message = args[0] as RabbitMQMessage;

      // Try to get InboxService for retry integration
      let inboxService: InboxService | null = null;
      try {
        inboxService = moduleRef.get<InboxService>(INBOX_SERVICE, { strict: false });
      } catch {
        // InboxService not available - will fall back to basic error handling
        inboxService = null;
      }

      const messageId = extractMessageId(message, options);
      const source = extractSource(options);
      const eventType = extractEventType(message, options);

      // Record message in inbox with deduplication
      const recordResult = await inboxRepository.record({
        messageId,
        source,
        eventType,
        payload: message,
      });

      // Skip handler execution for duplicate messages
      if (recordResult.isDuplicate) {
        if (logDuplicates) {
          console.log(
            `[InboxSubscribe] Duplicate message detected: ${messageId} from ${source}, skipping handler`,
          );
        }
        return;
      }

      const inboxMessage = recordResult.message;

      try {
        // Mark as processing
        await inboxRepository.markProcessing(inboxMessage.id);

        // Invoke original handler for new messages
        const result = await originalMethod.apply(this, args);

        // Mark as processed on success
        await inboxRepository.markProcessed(inboxMessage.id);

        return result;
      } catch (error) {
        // Handle error with retry logic
        await handleDecoratorError(
          inboxRepository,
          inboxService,
          inboxMessage,
          error,
          options,
        );
        throw error;
      }
    };

    // Apply RabbitSubscribe to the WRAPPED method
    const rabbitDecorator = RabbitSubscribe({
      exchange: options.exchange,
      routingKey: options.routingKey,
      queue: options.queue,
      queueOptions: options.queueOptions,
    }) as MethodDecorator;
    rabbitDecorator(target, propertyKey, descriptor);

    return descriptor;
  };
}
