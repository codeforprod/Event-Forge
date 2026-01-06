import { OutboxMessage } from './outbox-message.interface';

/**
 * Publishing Options
 */
export interface PublishOptions {
  /** Exchange name (for RabbitMQ) */
  exchange?: string;

  /** Routing key */
  routingKey?: string;

  /** Topic name (for Kafka, etc.) */
  topic?: string;

  /** Message priority (0-9, higher is more important) */
  priority?: number;

  /** Message TTL in milliseconds */
  expiration?: number;

  /** Custom headers */
  headers?: Record<string, unknown>;
}

/**
 * Message Publisher Interface
 * Defines operations for publishing messages to external systems
 */
export interface IMessagePublisher {
  /**
   * Publish a message to the message broker
   * @param message Outbox message to publish
   * @param options Publishing options
   * @throws Error if publishing fails
   */
  publish(message: OutboxMessage, options?: PublishOptions): Promise<void>;

  /**
   * Optional: Connect to the message broker
   * Called once during application startup
   */
  connect?(): Promise<void>;

  /**
   * Optional: Disconnect from the message broker
   * Called during graceful shutdown
   */
  disconnect?(): Promise<void>;

  /**
   * Optional: Check if publisher is connected
   */
  isConnected?(): boolean;
}
