import { RabbitMQMessage } from './rabbitmq-message.interface';

/**
 * Configuration options for InboxConsumer module
 */
export interface InboxConsumerOptions {
  /**
   * Default source identifier for inbox messages
   * If not specified at decorator level, this will be used
   */
  defaultSource?: string;

  /**
   * Global error handler for failed message processing
   */
  onError?: (error: Error, message: RabbitMQMessage) => void | Promise<void>;

  /**
   * Whether to automatically acknowledge messages after successful processing
   * Default: true
   */
  autoAck?: boolean;

  /**
   * Whether to log duplicate message detections
   * Default: true
   */
  logDuplicates?: boolean;
}

/**
 * Options for the @InboxSubscribe decorator
 */
export interface InboxSubscribeOptions {
  /**
   * RabbitMQ exchange name
   */
  exchange: string;

  /**
   * Routing key(s) to bind to
   */
  routingKey: string | string[];

  /**
   * Queue name (optional)
   */
  queue?: string;

  /**
   * Queue options (passed to RabbitMQ)
   */
  queueOptions?: Record<string, unknown>;

  /**
   * Source identifier for inbox messages
   * Used for deduplication
   */
  source?: string;

  /**
   * Message ID extractor function
   * If not provided, will use properties.messageId
   */
  messageIdExtractor?: (message: RabbitMQMessage) => string;

  /**
   * Event type extractor function
   * If not provided, will use properties.type or routingKey
   */
  eventTypeExtractor?: (message: RabbitMQMessage) => string;

  /**
   * Maximum number of retry attempts before marking as permanently failed
   * Default: uses message.maxRetries from inbox record (typically 3)
   */
  maxRetries?: number;

  /**
   * Whether to enable automatic retry scheduling on failure
   * Default: true
   */
  enableRetry?: boolean;

  /**
   * Base delay in seconds for exponential backoff calculation
   * Formula: min(backoffBaseSeconds * 2^retryCount, maxBackoffSeconds)
   * Default: 5
   */
  backoffBaseSeconds?: number;

  /**
   * Maximum delay in seconds for exponential backoff
   * Default: 3600 (1 hour)
   */
  maxBackoffSeconds?: number;
}
