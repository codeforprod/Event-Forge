import { IMessagePublisher, OutboxMessage, PublishOptions } from '@prodforcode/event-forge-core';

import { AmqpConnection, RabbitMQPublishOptions } from './types';

/**
 * Configuration options for DelayedMessagePublisher
 */
export interface DelayedPublisherConfig {
  /** Direct exchange name for immediate messages */
  directExchange: string;
  /** Delayed exchange name for delayed messages (requires x-delayed-message plugin) */
  delayedExchange: string;
}

/**
 * RabbitMQ Publisher with x-delayed-message support
 * Publishes outbox messages to RabbitMQ with support for delayed delivery
 *
 * Requirements:
 * - RabbitMQ server must have rabbitmq_delayed_message_exchange plugin enabled
 * - Delayed exchange must be created with type 'x-delayed-message'
 *
 * Message routing logic:
 * - If metadata.delay is present: Uses delayedExchange with x-delay header
 * - If metadata.delay is absent: Uses directExchange for immediate delivery
 *
 * Usage:
 * ```typescript
 * const publisher = new DelayedMessagePublisher(
 *   amqpConnection,
 *   {
 *     directExchange: 'events.direct',
 *     delayedExchange: 'events.delayed'
 *   }
 * );
 *
 * // Immediate message
 * await publisher.publish(message);
 *
 * // Delayed message (5 seconds)
 * await publisher.publish(message, {
 *   headers: { 'x-aggregate-type': 'User' }
 * });
 * // where message.metadata = { delay: 5000 }
 * ```
 */
export class DelayedMessagePublisher implements IMessagePublisher {
  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly config: DelayedPublisherConfig,
  ) {}

  async publish(message: OutboxMessage, options?: PublishOptions): Promise<void> {
    const routingKey = this.buildRoutingKey(message);
    const delay = this.extractDelay(message);
    const exchange = this.selectExchange(delay);

    const rabbitMQOptions: RabbitMQPublishOptions = {
      ...options,
      persistent: true,
      contentType: 'application/json',
      messageId: message.id,
      timestamp: message.createdAt.getTime(),
      headers: {
        ...options?.headers,
        'x-aggregate-type': message.aggregateType,
        'x-aggregate-id': message.aggregateId,
        'x-event-type': message.eventType,
        ...(delay !== null && { 'x-delay': delay }),
      },
    };

    await this.amqpConnection.publish(
      exchange,
      routingKey,
      {
        id: message.id,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: message.payload,
        metadata: message.metadata,
        createdAt: message.createdAt,
      },
      rabbitMQOptions,
    );
  }

  /**
   * Build routing key from message properties
   * Format: {aggregateType}.{eventType}
   * Example: User.user.created
   */
  private buildRoutingKey(message: OutboxMessage): string {
    return `${message.aggregateType}.${message.eventType}`;
  }

  /**
   * Extract delay from message metadata
   * @returns Delay in milliseconds or null if not present
   */
  private extractDelay(message: OutboxMessage): number | null {
    if (!message.metadata?.delay) {
      return null;
    }

    const delay = message.metadata.delay;

    if (typeof delay !== 'number') {
      return null;
    }

    if (delay < 0) {
      return null;
    }

    return delay;
  }

  /**
   * Select appropriate exchange based on delay presence
   * @param delay Delay in milliseconds or null
   * @returns Exchange name
   */
  private selectExchange(delay: number | null): string {
    if (delay === null) {
      return this.config.directExchange;
    }

    return this.config.delayedExchange;
  }
}
