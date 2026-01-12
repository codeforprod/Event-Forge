/**
 * RabbitMQ message structure
 * Based on amqplib ConsumeMessage format
 */
export interface RabbitMQMessage {
  /**
   * Message properties
   */
  properties?: {
    messageId?: string;
    type?: string;
    contentType?: string;
    contentEncoding?: string;
    deliveryMode?: number;
    priority?: number;
    correlationId?: string;
    replyTo?: string;
    expiration?: string;
    timestamp?: number;
    userId?: string;
    appId?: string;
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };

  /**
   * Message metadata fields
   */
  fields?: {
    deliveryTag?: number;
    redelivered?: boolean;
    exchange?: string;
    routingKey?: string;
    [key: string]: unknown;
  };

  /**
   * Message content buffer
   */
  content?: Buffer;

  /**
   * Allow additional properties
   */
  [key: string]: unknown;
}

/**
 * Type guard to check if a value is a RabbitMQ message
 */
export function isRabbitMQMessage(value: unknown): value is RabbitMQMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const msg = value as Record<string, unknown>;

  // Message must have at least properties or fields
  return (
    (typeof msg.properties === 'object' && msg.properties !== null) ||
    (typeof msg.fields === 'object' && msg.fields !== null)
  );
}
