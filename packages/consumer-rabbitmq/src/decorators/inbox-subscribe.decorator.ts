import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ModuleRef } from '@nestjs/core';
import {
  IInboxRepository,
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
 * Decorator that combines RabbitMQ subscription with automatic INBOX recording
 * and inline retry logic.
 *
 * This decorator wraps @RabbitSubscribe from @golevelup/nestjs-rabbitmq
 * and adds automatic inbox message recording for idempotency.
 *
 * Retries are handled inline (sleep + retry loop) — no DB polling needed.
 * The message is always ACKed (never re-thrown to AMQP).
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

      // Try to get InboxService for event emission
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

      // Extract metadata from message body (e.g., trace context)
      const messageRecord = message as Record<string, unknown>;
      const metadata = (messageRecord.metadata && typeof messageRecord.metadata === 'object')
        ? messageRecord.metadata as Record<string, unknown>
        : undefined;

      // Record message in inbox with deduplication
      const recordResult = await inboxRepository.record({
        messageId,
        source,
        eventType,
        payload: message,
        metadata,
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
      const enableRetry = options.enableRetry ?? true;
      const maxRetries = options.maxRetries ?? inboxMessage.maxRetries;

      // Inline retry loop — wrapped in try/catch to enforce "always ACK" guarantee.
      // If any repository call (markProcessing, markFailed, etc.) throws unexpectedly
      // (e.g., DB connection lost), we log and return (ACK) to prevent infinite redelivery.
      try {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            await inboxRepository.markProcessing(inboxMessage.id);

            const result = await originalMethod.apply(this, args);

            await inboxRepository.markProcessed(inboxMessage.id);
            return result; // SUCCESS → consumer ACKs
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const isPermanent = error instanceof ProcessingError;

            if (isPermanent || !enableRetry || attempt >= maxRetries) {
              // Permanent failure or max retries reached
              await inboxRepository.markFailed(inboxMessage.id, errorMsg, true);

              if (inboxService) {
                inboxService.emit(InboxEvents.MESSAGE_FAILED, {
                  message: inboxMessage,
                  error: errorMsg,
                  permanent: true,
                });
              }

              console.error(
                `[InboxSubscribe] Message ${messageId} permanently failed after ${attempt} retries: ${errorMsg}`,
              );
              return; // ACK — all retries handled, no throw
            }

            // Calculate backoff and schedule retry
            const backoffDelay = calculateBackoff(attempt, {
              backoffBaseSeconds: options.backoffBaseSeconds,
              maxBackoffSeconds: options.maxBackoffSeconds,
            });

            await inboxRepository.markFailed(inboxMessage.id, errorMsg, false);

            if (inboxService) {
              inboxService.emit(InboxEvents.MESSAGE_FAILED, {
                message: inboxMessage,
                error: errorMsg,
                permanent: false,
              });
            }

            console.error(
              `[InboxSubscribe] Message ${messageId} failed (retry ${attempt + 1}/${maxRetries}): ${errorMsg}. Retrying in ${Math.round(backoffDelay / 1000)}s`,
            );

            // Wait for backoff delay before retrying
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }
        }
      } catch (infrastructureError) {
        // Catch-all for infrastructure errors (DB down, network issues).
        // Log and ACK to prevent infinite redelivery of poison messages.
        console.error(
          `[InboxSubscribe] Infrastructure error processing message ${messageId}: ${
            infrastructureError instanceof Error ? infrastructureError.message : String(infrastructureError)
          }. ACKing to prevent redelivery storm.`,
        );
      }

      return undefined;
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
