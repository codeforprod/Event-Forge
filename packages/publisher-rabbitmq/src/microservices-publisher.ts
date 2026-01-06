import { IMessagePublisher, OutboxMessage, PublishOptions } from '@event-forge/inbox-outbox-core';

/**
 * Client proxy interface for @nestjs/microservices
 * Used in Holocron style projects
 */
export interface ClientProxy {
  emit<TResult = unknown, TInput = unknown>(
    pattern: string,
    data: TInput,
  ): Promise<TResult> | TResult;
}

/**
 * RabbitMQ Publisher using @nestjs/microservices
 * Publishes outbox messages to RabbitMQ using NestJS microservices
 */
export class MicroservicesPublisher implements IMessagePublisher {
  constructor(private readonly clientProxy: ClientProxy) {}

  async publish(message: OutboxMessage, options?: PublishOptions): Promise<void> {
    const pattern = this.buildPattern(message);

    const messageData = {
      id: message.id,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      eventType: message.eventType,
      payload: message.payload,
      metadata: {
        ...message.metadata,
        ...options?.headers,
        messageId: message.id,
        timestamp: message.createdAt.getTime(),
        persistent: true,
        contentType: 'application/json',
      },
      createdAt: message.createdAt,
    };

    await this.clientProxy.emit(pattern, messageData);
  }

  /**
   * Build pattern from message properties
   * Format: {eventType}
   * Example: user.created
   *
   * NestJS Microservices uses event patterns instead of routing keys
   */
  private buildPattern(message: OutboxMessage): string {
    return message.eventType;
  }
}
