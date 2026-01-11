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
   * Build routing key from message properties
   * Format: {aggregateType}.{eventType}
   * Example: User.user.created
   */
  private buildRoutingKey(message: OutboxMessage): string {
    return `${message.aggregateType}.${message.eventType}`;
  }
}
