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
 * - Routing Key: Uses metadata.routingKey if present, otherwise {aggregateType}.{eventType}
 * - Exchange: Uses metadata.exchange if present (immediate only), otherwise:
 *   - If metadata.delay is present: Uses delayedExchange with x-delay header
 *   - If metadata.delay is absent: Uses directExchange for immediate delivery
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
 * // Immediate message (default routing)
 * await publisher.publish(message);
 *
 * // Delayed message (5 seconds)
 * await publisher.publish({ ...message, metadata: { delay: 5000 } });
 *
 * // Custom routing key
 * await publisher.publish({ ...message, metadata: { routingKey: 'sms.priority.high' } });
 *
 * // Custom exchange (immediate only)
 * await publisher.publish({ ...message, metadata: { exchange: 'notifications.fanout', routingKey: '' } });
 * ```
 */
export class DelayedMessagePublisher implements IMessagePublisher {
  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly config: DelayedPublisherConfig,
  ) {}

  async publish(message: OutboxMessage, options?: PublishOptions): Promise<void> {
    const routingKey = this.getRoutingKey(message);
    const delay = this.extractDelay(message);
    const exchange = this.getExchange(message, delay);

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
   * Get routing key for message
   * Uses metadata.routingKey if present, otherwise builds default format
   * Default format: {aggregateType}.{eventType}
   * Example: User.user.created or custom override from metadata
   */
  private getRoutingKey(message: OutboxMessage): string {
    const customRoutingKey = this.extractCustomRoutingKey(message);
    if (customRoutingKey !== null) {
      return customRoutingKey;
    }
    return this.buildRoutingKey(message);
  }

  /**
   * Build default routing key from message properties
   * Format: {aggregateType}.{eventType}
   * Example: User.user.created
   */
  private buildRoutingKey(message: OutboxMessage): string {
    return `${message.aggregateType}.${message.eventType}`;
  }

  /**
   * Extract custom routing key from message metadata
   * @returns Custom routing key string or null if not present or invalid
   */
  private extractCustomRoutingKey(message: OutboxMessage): string | null {
    if (!message.metadata || !('routingKey' in message.metadata)) {
      return null;
    }

    const routingKey = message.metadata.routingKey;

    if (typeof routingKey !== 'string') {
      return null;
    }

    return routingKey;
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
   * Get exchange for message
   * Uses metadata.exchange if present (for immediate messages only), otherwise selects based on delay
   * @param message The outbox message
   * @param delay Delay in milliseconds or null
   * @returns Exchange name
   */
  private getExchange(message: OutboxMessage, delay: number | null): string {
    const customExchange = this.extractCustomExchange(message);
    if (customExchange !== null && delay === null) {
      return customExchange;
    }
    return this.selectExchange(delay);
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

  /**
   * Extract custom exchange from message metadata
   * Only applies to immediate messages (no delay)
   * @returns Custom exchange string or null if not present or invalid
   */
  private extractCustomExchange(message: OutboxMessage): string | null {
    if (!message.metadata || !('exchange' in message.metadata)) {
      return null;
    }

    const exchange = message.metadata.exchange;

    if (typeof exchange !== 'string') {
      return null;
    }

    return exchange;
  }
}
