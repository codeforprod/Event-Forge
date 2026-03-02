import { IMessagePublisher, OutboxMessage, PublishOptions } from '@prodforcode/event-forge-core';

import { AmqpConnection, RabbitMQPublishOptions } from './types';

/**
 * RabbitMQ Publisher using @golevelup/nestjs-rabbitmq
 * Publishes outbox messages to RabbitMQ using the Golevelup library
 */
export class GolevelupPublisher implements IMessagePublisher {
  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly exchange: string,
  ) {}

  async publish(message: OutboxMessage, options?: PublishOptions): Promise<void> {
    const routingKey = this.buildRoutingKey(message);

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
        ...this.buildTraceparentHeader(message),
      },
    };

    await this.amqpConnection.publish(
      this.exchange,
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
   * Build W3C traceparent header from message metadata
   * Format: 00-{traceId}-{spanId}-01
   */
  private buildTraceparentHeader(message: OutboxMessage): Record<string, string> {
    const traceId = message.metadata?.traceId;
    if (!traceId || typeof traceId !== 'string') {
      return {};
    }
    const spanId = typeof message.metadata?.spanId === 'string'
      ? message.metadata.spanId
      : '0000000000000000';
    return { traceparent: `00-${traceId}-${spanId}-01` };
  }

  /**
   * Build routing key from message properties
   * Format: {aggregateType}.{eventType}
   * Example: User.user.created
   */
  private buildRoutingKey(message: OutboxMessage): string {
    return `${message.aggregateType}.${message.eventType}`;
  }
}
