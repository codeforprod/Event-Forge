import { PublishOptions } from '@prodforcode/event-forge-core';

/**
 * RabbitMQ-specific publish options extending core PublishOptions
 */
export interface RabbitMQPublishOptions extends PublishOptions {
  /** Make message persistent */
  persistent?: boolean;
  /** Content type */
  contentType?: string;
  /** Message ID */
  messageId?: string;
  /** Timestamp */
  timestamp?: number;
}

/**
 * Publisher interface for @golevelup/nestjs-rabbitmq
 * Used in event-forge style projects
 */
export interface AmqpConnection {
  publish<T = unknown>(
    exchange: string,
    routingKey: string,
    message: T,
    options?: RabbitMQPublishOptions,
  ): Promise<void>;
}
