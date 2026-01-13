# @prodforcode/event-forge-rabbitmq-consumer

RabbitMQ consumer with automatic INBOX recording for Event-Forge. This package provides seamless integration with `@golevelup/nestjs-rabbitmq` to automatically record incoming messages in the inbox for idempotency and deduplication.

## Features

- **Automatic INBOX Recording**: Messages are automatically recorded in the inbox before handler execution
- **Idempotency**: Duplicate messages are automatically detected and skipped
- **Decorator-Based**: Simple `@InboxSubscribe` decorator for marking consumer methods
- **RabbitMQ Integration**: Built on top of `@golevelup/nestjs-rabbitmq`
- **Flexible Configuration**: Customizable message ID extraction and event type detection
- **TypeScript Support**: Full type safety and IntelliSense support

## Installation

```bash
npm install @prodforcode/event-forge-rabbitmq-consumer @prodforcode/event-forge-core @golevelup/nestjs-rabbitmq
```

## Prerequisites

1. An Event-Forge inbox service configured (TypeORM or Mongoose adapter)
2. RabbitMQ server running
3. NestJS application with `@nestjs/common` and `@nestjs/core`

## Quick Start

### 1. Import the Module

```typescript
import { Module } from '@nestjs/common';
import { InboxConsumerModule } from '@prodforcode/event-forge-rabbitmq-consumer';
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { TypeOrmInboxOutboxModule } from '@prodforcode/event-forge-typeorm';

@Module({
  imports: [
    // Setup inbox repository (TypeORM example)
    TypeOrmInboxOutboxModule.forRoot({
      /* TypeORM config */
    }),

    // Setup inbox service
    InboxOutboxModule.forRoot(),

    // Setup RabbitMQ consumer with inbox recording
    InboxConsumerModule.forRoot({
      inboxConsumer: {
        defaultSource: 'my-service',
        logDuplicates: true,
      },
      rabbitmq: {
        uri: 'amqp://localhost:5672',
        connectionInitOptions: { wait: true },
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Create a Consumer

```typescript
import { Injectable } from '@nestjs/common';
import { InboxSubscribe } from '@prodforcode/event-forge-rabbitmq-consumer';

@Injectable()
export class UserConsumer {
  @InboxSubscribe({
    exchange: 'events',
    routingKey: 'user.created',
    queue: 'my-service.user.created',
    source: 'user-service',
  })
  async handleUserCreated(message: any) {
    // Message is automatically recorded in inbox before this handler is called
    // Duplicate messages are automatically filtered out
    console.log('User created:', message);

    // Your business logic here
    await this.processUserCreation(message);
  }

  private async processUserCreation(message: any) {
    // Implementation...
  }
}
```

### 3. Register the Consumer

```typescript
import { Module } from '@nestjs/common';
import { UserConsumer } from './user.consumer';

@Module({
  providers: [UserConsumer],
})
export class UserModule {}
```

## Configuration

### Module Options

#### `InboxConsumerModuleOptions`

```typescript
interface InboxConsumerModuleOptions {
  inboxConsumer?: {
    defaultSource?: string; // Default source for all consumers
    logDuplicates?: boolean; // Log duplicate messages (default: true)
    autoAck?: boolean; // Auto-acknowledge messages (default: true)
    onError?: (error: Error, message: any) => void | Promise<void>; // Global error handler
  };
  rabbitmq?: RabbitMQConfig; // RabbitMQ connection options
  isGlobal?: boolean; // Make module global (default: false)
}
```

### Decorator Options

#### `@InboxSubscribe(options)`

```typescript
interface InboxSubscribeOptions {
  exchange: string; // RabbitMQ exchange name
  routingKey: string | string[]; // Routing key(s)
  queue?: string; // Queue name (optional)
  queueOptions?: any; // Queue options
  source?: string; // Source identifier for inbox
  messageIdExtractor?: (message: any) => string; // Custom message ID extraction
  eventTypeExtractor?: (message: any) => string; // Custom event type extraction
}
```

## Advanced Usage

### Custom Message ID Extraction

```typescript
@InboxSubscribe({
  exchange: 'events',
  routingKey: 'order.placed',
  source: 'order-service',
  messageIdExtractor: (message) => {
    return message.properties.headers['x-order-id'];
  },
})
async handleOrderPlaced(message: any) {
  // Handler logic
}
```

### Custom Event Type Extraction

```typescript
@InboxSubscribe({
  exchange: 'events',
  routingKey: 'payment.*',
  source: 'payment-service',
  eventTypeExtractor: (message) => {
    return message.properties.headers['event-type'];
  },
})
async handlePaymentEvent(message: any) {
  // Handler logic
}
```

### Multiple Routing Keys

```typescript
@InboxSubscribe({
  exchange: 'events',
  routingKey: ['user.created', 'user.updated', 'user.deleted'],
  queue: 'my-service.user.events',
  source: 'user-service',
})
async handleUserEvents(message: any) {
  // Handler logic for all user events
}
```

### Global Error Handler

```typescript
InboxConsumerModule.forRoot({
  inboxConsumer: {
    defaultSource: 'my-service',
    onError: async (error, message) => {
      console.error('Message processing failed:', error);
      // Send to dead letter queue, log to monitoring, etc.
    },
  },
  rabbitmq: {
    /* ... */
  },
});
```

### Async Configuration

```typescript
import { ConfigService } from '@nestjs/config';

InboxConsumerModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    inboxConsumer: {
      defaultSource: configService.get('SERVICE_NAME'),
      logDuplicates: configService.get('LOG_DUPLICATES', true),
    },
    rabbitmq: {
      uri: configService.get('RABBITMQ_URI'),
      connectionInitOptions: { wait: true },
    },
  }),
  inject: [ConfigService],
  isGlobal: true,
});
```

## How It Works

1. **Decoration**: Methods decorated with `@InboxSubscribe` are discovered at module initialization
2. **Wrapping**: Original handlers are wrapped to add inbox recording logic
3. **Message Arrival**: When a message arrives from RabbitMQ
4. **Inbox Recording**: Message is recorded in the inbox via `InboxService.receiveMessage()`
5. **Duplicate Check**: If message is duplicate (same messageId + source), handler is skipped
6. **Handler Execution**: If not duplicate, original handler is called
7. **Acknowledgment**: Message is acknowledged (if autoAck is true)

## Message ID Extraction

The service attempts to extract message ID in this order:

1. Custom `messageIdExtractor` (if provided)
2. `message.properties.messageId`
3. `message.fields.deliveryTag` (converted to string)

If none of these exist, an error is thrown.

## Event Type Extraction

The service attempts to extract event type in this order:

1. Custom `eventTypeExtractor` (if provided)
2. `message.properties.type`
3. First routing key from decorator options
4. `'unknown'` as fallback

## Source Identifier

The source identifier is determined in this order:

1. `source` in decorator options
2. `defaultSource` in module options
3. Error is thrown if neither is provided

## Testing

```typescript
import { Test } from '@nestjs/testing';
import { InboxService } from '@prodforcode/event-forge-core';
import { UserConsumer } from './user.consumer';

describe('UserConsumer', () => {
  let consumer: UserConsumer;
  let inboxService: InboxService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserConsumer,
        {
          provide: InboxService,
          useValue: {
            receiveMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get(UserConsumer);
    inboxService = module.get(InboxService);
  });

  it('should process user created event', async () => {
    const message = {
      properties: { messageId: 'msg-123', type: 'user.created' },
      content: { userId: '1', name: 'John' },
    };

    jest.spyOn(inboxService, 'receiveMessage').mockResolvedValue({
      message: { id: 'inbox-1' } as any,
      isDuplicate: false,
    });

    await consumer.handleUserCreated(message);

    expect(inboxService.receiveMessage).toHaveBeenCalledWith({
      messageId: 'msg-123',
      source: 'user-service',
      eventType: 'user.created',
      payload: message,
    });
  });
});
```

## Best Practices

1. **Unique Message IDs**: Ensure messages have unique IDs for proper deduplication
2. **Source Consistency**: Use consistent source identifiers across your system
3. **Error Handling**: Implement global error handler for monitoring and alerting
4. **Queue Names**: Use descriptive queue names that include service name
5. **Testing**: Write unit tests that mock `InboxService` for faster execution

## Troubleshooting

### "Unable to extract message ID"

Ensure your messages have one of:

- `properties.messageId`
- `fields.deliveryTag`
- Provide custom `messageIdExtractor`

### "Source identifier is required"

Provide either:

- `source` in decorator options
- `defaultSource` in module configuration

### Handlers not being wrapped

Ensure:

- Class is registered as provider
- Method is decorated with `@InboxSubscribe`
- Module is properly imported

## License

MIT

## Related Packages

- [@prodforcode/event-forge-core](../core) - Core interfaces and services
- [@prodforcode/event-forge-rabbitmq](../publisher-rabbitmq) - RabbitMQ publishers
- [@prodforcode/event-forge-typeorm](../adapter-typeorm) - TypeORM adapter
- [@prodforcode/event-forge-nestjs](../nestjs) - NestJS integration
