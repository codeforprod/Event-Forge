/**
 * @prodforcode/event-forge-rabbitmq-consumer
 *
 * RabbitMQ consumer with automatic INBOX recording for Event-Forge
 */

// Module
export {
  InboxConsumerModule,
  InboxConsumerModuleOptions,
  InboxConsumerModuleAsyncOptions,
  INBOX_CONSUMER_OPTIONS,
} from './inbox-consumer.module';

// Services
export { InboxConsumerService } from './services/inbox-consumer.service';

// Decorators
export {
  InboxSubscribe,
  INBOX_SUBSCRIBE_METADATA,
} from './decorators/inbox-subscribe.decorator';

// Interfaces
export {
  InboxConsumerOptions,
  InboxSubscribeOptions,
} from './interfaces/inbox-consumer-options.interface';
export {
  RabbitMQMessage,
  isRabbitMQMessage,
} from './interfaces/rabbitmq-message.interface';
