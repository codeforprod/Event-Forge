# @prodforcode/event-forge-rabbitmq-consumer

RabbitMQ consumer with automatic INBOX recording for Event-Forge. This package provides seamless integration with `@golevelup/nestjs-rabbitmq` to automatically record incoming messages in the inbox for idempotency and deduplication.

## Features

- **Automatic INBOX Recording**: Messages are automatically recorded in the inbox before handler execution
- **Idempotency**: Duplicate messages are automatically detected and skipped
- **Automatic Retry with Exponential Backoff**: Failed messages are scheduled for retry with configurable backoff
- **Decorator-Based**: Simple `@InboxSubscribe` decorator for marking consumer methods
- **RabbitMQ Integration**: Built on top of `@golevelup/nestjs-rabbitmq`
- **Flexible Configuration**: Customizable message ID extraction, event type detection, and retry behavior
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

  // Retry Configuration
  maxRetries?: number; // Maximum retry attempts (default: uses inbox record value, typically 3)
  enableRetry?: boolean; // Enable automatic retry scheduling (default: true)
  backoffBaseSeconds?: number; // Base delay for exponential backoff (default: 5)
  maxBackoffSeconds?: number; // Maximum delay cap (default: 3600 = 1 hour)
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

### Retry Configuration

Configure exponential backoff for failed message retries:

```typescript
@InboxSubscribe({
  exchange: 'events',
  routingKey: 'order.placed',
  source: 'order-service',
  // Retry configuration
  maxRetries: 5, // Retry up to 5 times before permanent failure
  enableRetry: true, // Enable automatic retry scheduling
  backoffBaseSeconds: 10, // Start with 10 second delay
  maxBackoffSeconds: 1800, // Cap at 30 minutes
})
async handleOrderPlaced(message: any) {
  // If this throws an error:
  // 1. Message status updates to "failed"
  // 2. error_message field is populated
  // 3. Retry is scheduled with exponential backoff
  // 4. MESSAGE_FAILED event is emitted
  await this.processOrder(message);
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
4. **Inbox Recording**: Message is recorded in the inbox via `IInboxRepository.record()`
5. **Duplicate Check**: If message is duplicate (same messageId + source), handler is skipped
6. **Processing**: Message status changes to "processing"
7. **Handler Execution**: If not duplicate, original handler is called
8. **Success**: Message status changes to "processed"
9. **Failure**: If handler throws, message status changes to "failed" and retry is scheduled

## Retry Mechanism

When a handler throws an error, the `@InboxSubscribe` decorator automatically:

1. **Updates Status**: Changes INBOX record status from "processing" to "failed"
2. **Records Error**: Populates `error_message` field with error details
3. **Schedules Retry**: Calculates next retry time using exponential backoff
4. **Emits Event**: Emits `MESSAGE_FAILED` event for monitoring

### Exponential Backoff Formula

```
delay = min(backoffBaseSeconds × 2^retryCount, maxBackoffSeconds) ± 10% jitter
```

**Example with default settings (backoffBaseSeconds=5, maxBackoffSeconds=3600):**

| Retry # | Base Delay | With Jitter (±10%) |
|---------|------------|-------------------|
| 0 | 5s | 4.5s - 5.5s |
| 1 | 10s | 9s - 11s |
| 2 | 20s | 18s - 22s |
| 3 | 40s | 36s - 44s |
| 4 | 80s | 72s - 88s |
| 5 | 160s | 144s - 176s |
| 6 | 320s | 288s - 352s |
| 7 | 640s | 576s - 704s |
| 8+ | 1200s (capped) | 1080s - 1320s |

### Permanent Failure

A message is marked as **permanently failed** when:
- `retryCount >= maxRetries` - Max retry attempts exceeded
- Handler throws `ProcessingError` - Signals non-recoverable error

```typescript
import { ProcessingError } from '@prodforcode/event-forge-core';

@InboxSubscribe({
  exchange: 'events',
  routingKey: 'payment.process',
  source: 'payment-service',
})
async handlePayment(message: any) {
  if (!message.payload.cardNumber) {
    // This will mark message as permanently failed (no retry)
    throw new ProcessingError('Invalid payment data: missing card number');
  }
  // Regular errors will be retried
  await this.processPayment(message);
}
```

### Starting Retry Polling

**IMPORTANT**: For scheduled retries to actually execute, you must start the retry polling in `InboxService`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class RetryPollingService implements OnModuleInit {
  constructor(private readonly inboxService: InboxService) {}

  onModuleInit() {
    // Start polling for failed messages that are due for retry
    this.inboxService.startRetryPolling();
  }
}
```

Or configure automatic retry polling in `InboxOutboxModule`:

```typescript
InboxOutboxModule.forRoot({
  inbox: {
    repository: TypeOrmInboxRepository,
    config: {
      enableRetry: true, // Must be true for retry polling
      retryPollingInterval: 5000, // Check every 5 seconds (default)
      maxRetries: 3, // Default max retry attempts
      backoffBaseSeconds: 5, // Default base delay
      maxBackoffSeconds: 3600, // Default max delay (1 hour)
    },
  },
  // ... other config
});
```

### Retry Flow Diagram

```
Message Received
       │
       ▼
┌─────────────────┐
│ Record in Inbox │
└────────┬────────┘
         │
         ▼
   Is Duplicate?
    ╱         ╲
  YES          NO
   │            │
   ▼            ▼
 Skip      Execute Handler
   │          ╱    ╲
   │       Success  Error
   │          │       │
   │          ▼       ▼
   │     Mark as   Mark as Failed
   │    Processed  + Schedule Retry
   │          │       │
   │          └───┬───┘
   │              │
   │              ▼
   └────────► Complete
                  │
                  ▼
        [Retry Polling Loop]
                  │
                  ▼
   ┌──────────────────────────┐
   │ InboxService polls for   │
   │ failed messages where    │
   │ scheduledAt <= now       │
   └────────────┬─────────────┘
                │
                ▼
          Re-execute Handler
             ╱    ╲
          Success  Error (retryCount < maxRetries)
             │            │
             ▼            ▼
        Mark as      Reschedule with
       Processed     increased backoff
```

## Message ID Extraction

The decorator attempts to extract message ID in this order:

1. Custom `messageIdExtractor` (if provided) - highest priority
2. `message.id` - EventForge message format (message body with `id` field)
3. `message.properties.messageId` - Raw AMQP message property

If none of these exist, an error is thrown with guidance on how to provide a message ID.

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

- `message.id` field in message body (EventForge format)
- `properties.messageId` (raw AMQP property)
- Provide custom `messageIdExtractor` function

### "Source identifier is required"

Provide either:

- `source` in decorator options
- `defaultSource` in module configuration

### "InboxConsumerModule not initialized"

Ensure:

- `InboxConsumerModule.forRoot()` is imported in your app module
- Module is properly initialized before handlers are called

### "IInboxRepository not found"

Ensure:

- An inbox repository adapter is registered (TypeORM or Mongoose)
- Repository is exported from its module

### Retries not executing

Ensure:

- `inboxService.startRetryPolling()` is called (or `enableRetry: true` in config)
- `scheduledAt` field in inbox record is in the past
- Message status is "failed" (not "permanently_failed")

### Handlers not being wrapped

Ensure:

- Class is registered as provider
- Method is decorated with `@InboxSubscribe`
- Module is properly imported

## License

MIT

## Related Packages

- [@prodforcode/event-forge-core](../core) - Core interfaces and services
- [@prodforcode/event-forge-rabbitmq-publisher](../publisher-rabbitmq) - RabbitMQ publishers
- [@prodforcode/event-forge-typeorm](../adapter-typeorm) - TypeORM adapter
- [@prodforcode/event-forge-nestjs](../nestjs) - NestJS integration
