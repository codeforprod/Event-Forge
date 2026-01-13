import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ModuleRef } from '@nestjs/core';
import { IInboxRepository } from '@prodforcode/event-forge-core';

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

      try {
        const messageId = extractMessageId(message, options);
        const source = extractSource(options);
        const eventType = extractEventType(message, options);

        // Record message in inbox with deduplication
        const { isDuplicate } = await inboxRepository.record({
          messageId,
          source,
          eventType,
          payload: message,
        });

        // Skip handler execution for duplicate messages
        if (isDuplicate) {
          if (logDuplicates) {
            console.log(
              `[InboxSubscribe] Duplicate message detected: ${messageId} from ${source}, skipping handler`,
            );
          }
          return;
        }

        // Invoke original handler for new messages
        return originalMethod.apply(this, args);
      } catch (error) {
        console.error(
          `[InboxSubscribe] Error in inbox handler ${String(propertyKey)}:`,
          error instanceof Error ? error.message : error,
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
