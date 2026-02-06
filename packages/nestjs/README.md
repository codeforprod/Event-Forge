# @prodforcode/event-forge-nestjs

NestJS module for the Universal Inbox-Outbox Pattern with automatic lifecycle management.

## Installation

```bash
npm install @prodforcode/event-forge-nestjs @prodforcode/event-forge-core
# or
pnpm add @prodforcode/event-forge-nestjs @prodforcode/event-forge-core
```

## Features

- **Automatic Polling Management**: Outbox and Inbox polling starts automatically on application bootstrap and stops gracefully on shutdown
- **Inbox Retry with Exponential Backoff**: Failed messages are automatically retried with configurable backoff strategy
- **Configurable Lifecycle**: Control automatic polling behavior via `lifecycle.autoStart` option
- **Dependency Injection**: Full NestJS DI support for repositories and services
- **Database Agnostic**: Works with any database adapter (TypeORM, Mongoose, etc.)

## Quick Start

### With Automatic Lifecycle (Default)

The simplest setup automatically manages polling lifecycle:

```typescript
import { Module } from '@nestjs/common';
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { TypeOrmOutboxRepository } from '@prodforcode/event-forge-typeorm';
import { RabbitMQPublisher } from '@prodforcode/event-forge-rabbitmq-publisher';

@Module({
  imports: [
    InboxOutboxModule.forRootAsync({
      useFactory: () => ({
        outbox: {
          repository: TypeOrmOutboxRepository,
          config: {
            pollingIntervalMs: 1000,
            batchSize: 50,
          },
        },
        publisher: RabbitMQPublisher,
        // lifecycle.autoStart defaults to true - polling starts automatically
      }),
    }),
  ],
})
export class AppModule {}
```

With this configuration:
- Outbox polling **starts automatically** when the application boots
- Polling **stops gracefully** when the application shuts down
- No manual lifecycle management required

### With Manual Lifecycle Control

If you need custom startup logic, disable automatic lifecycle:

```typescript
@Module({
  imports: [
    InboxOutboxModule.forRootAsync({
      useFactory: () => ({
        outbox: {
          repository: TypeOrmOutboxRepository,
        },
        publisher: RabbitMQPublisher,
        lifecycle: {
          autoStart: false, // Disable automatic polling
        },
      }),
    }),
  ],
})
export class AppModule {
  constructor(private readonly outboxService: OutboxService) {}

  onApplicationBootstrap() {
    // Custom startup logic here
    console.log('Running custom initialization...');

    // Manually start polling when ready
    this.outboxService.startPolling();
  }

  onApplicationShutdown() {
    // Custom shutdown logic
    this.outboxService.stopPolling();
  }
}
```

### Inbox Retry Polling

When `enableRetry: true` is set in inbox config, the `InboxService` will automatically poll for failed messages that are due for retry:

```typescript
@Module({
  imports: [
    InboxOutboxModule.forRootAsync({
      useFactory: () => ({
        inbox: {
          repository: TypeOrmInboxRepository,
          config: {
            enableRetry: true, // Enable retry polling
            retryPollingInterval: 5000, // Check every 5 seconds
            maxRetries: 5,
            backoffBaseSeconds: 10,
            maxBackoffSeconds: 1800, // 30 minutes max
          },
        },
        // ... other config
      }),
    }),
  ],
})
export class AppModule {}
```

With this configuration:
- Failed messages are automatically retried with exponential backoff
- Polling starts automatically when the application boots (if `lifecycle.autoStart` is true)
- Messages exceeding `maxRetries` are marked as permanently failed

#### Manual Retry Polling Control

If you need fine-grained control over retry polling:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class RetryPollingService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly inboxService: InboxService) {}

  onModuleInit() {
    // Start retry polling manually
    this.inboxService.startRetryPolling();
  }

  onModuleDestroy() {
    // Stop retry polling on shutdown
    this.inboxService.stopRetryPolling();
  }
}
```

## Configuration

### Lifecycle Options

```typescript
interface LifecycleOptions {
  /**
   * Whether to automatically start outbox polling on application bootstrap
   * @default true
   */
  autoStart?: boolean;
}
```

### Module Options

```typescript
InboxOutboxModule.forRootAsync({
  useFactory: () => ({
    outbox: {
      repository: OutboxRepositoryClass,
      config: {
        pollingIntervalMs: 1000,
        batchSize: 50,
        maxRetries: 5,
      },
    },
    inbox: {
      repository: InboxRepositoryClass,
      config: {
        // Retry configuration for failed messages
        enableRetry: true, // Enable automatic retry polling (default: false)
        retryPollingInterval: 5000, // Poll interval in ms (default: 5000)
        maxRetries: 3, // Max retry attempts (default: 3)
        backoffBaseSeconds: 5, // Base delay for exponential backoff (default: 5)
        maxBackoffSeconds: 3600, // Max delay cap in seconds (default: 3600 = 1 hour)
      },
    },
    publisher: PublisherClass,
    lifecycle: {
      autoStart: true, // Default behavior
    },
  }),
});
```

### Inbox Configuration Options

```typescript
interface InboxConfig {
  /**
   * Enable automatic retry polling for failed messages
   * @default false
   */
  enableRetry?: boolean;

  /**
   * Polling interval in milliseconds to check for messages due for retry
   * @default 5000
   */
  retryPollingInterval?: number;

  /**
   * Maximum number of retry attempts before marking as permanently failed
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in seconds for exponential backoff calculation
   * Formula: min(backoffBaseSeconds × 2^retryCount, maxBackoffSeconds)
   * @default 5
   */
  backoffBaseSeconds?: number;

  /**
   * Maximum delay in seconds for exponential backoff
   * @default 3600 (1 hour)
   */
  maxBackoffSeconds?: number;
}
```

## Advanced Usage

### Accessing the Lifecycle Service

The `EventForgeLifecycleService` is exported and can be injected for advanced control:

```typescript
import { Injectable } from '@nestjs/common';
import { EventForgeLifecycleService } from '@prodforcode/event-forge-nestjs';

@Injectable()
export class CustomService {
  constructor(
    private readonly lifecycleService: EventForgeLifecycleService,
  ) {}

  // The lifecycle service handles start/stop automatically
  // You typically don't need to interact with it directly
}
```

### Health Checks

Integrate with NestJS health checks:

```typescript
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { OutboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class OutboxHealthIndicator extends HealthIndicator {
  constructor(private readonly outboxService: OutboxService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // Check if polling is active
    const isPolling = this.outboxService.isPolling();

    return this.getStatus(key, isPolling, {
      polling: isPolling,
    });
  }
}
```

## Migration from Manual Lifecycle

If you're migrating from manual lifecycle management:

**Before** (manual):
```typescript
@Module({
  imports: [InboxOutboxModule.forRootAsync({...})],
})
export class AppModule {
  constructor(private readonly outboxService: OutboxService) {}

  onApplicationBootstrap() {
    this.outboxService.startPolling(); // Manual start
  }

  onApplicationShutdown() {
    this.outboxService.stopPolling(); // Manual stop
  }
}
```

**After** (automatic):
```typescript
@Module({
  imports: [
    InboxOutboxModule.forRootAsync({
      // ... config ...
      // lifecycle.autoStart: true is the default
    }),
  ],
})
export class AppModule {
  // No lifecycle hooks needed!
}
```

## API Reference

### EventForgeLifecycleService

Implements NestJS lifecycle hooks to automatically manage outbox polling.

**Methods:**
- `onApplicationBootstrap()`: Starts outbox polling automatically
- `onApplicationShutdown()`: Stops outbox polling gracefully

**Note**: This service is automatically provided when `lifecycle.autoStart` is not `false` and an outbox configuration exists.

## License

MIT
