import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { SetMetadata } from '@nestjs/common';

import { InboxSubscribeOptions } from '../interfaces/inbox-consumer-options.interface';

/**
 * Metadata key for storing InboxSubscribe configuration
 */
export const INBOX_SUBSCRIBE_METADATA = 'inbox:subscribe';

/**
 * Decorator that combines RabbitMQ subscription with automatic INBOX recording
 *
 * This decorator wraps @RabbitSubscribe from @golevelup/nestjs-rabbitmq
 * and adds automatic inbox message recording for idempotency.
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
    // Store metadata for InboxConsumerService to read
    const metadataDecorator = SetMetadata(
      INBOX_SUBSCRIBE_METADATA,
      options,
    ) as MethodDecorator;
    metadataDecorator(target, propertyKey, descriptor);

    // Apply RabbitSubscribe to get actual message handling
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
