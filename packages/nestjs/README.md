# @prodforcode/event-forge-nestjs

NestJS module for the Universal Inbox-Outbox Pattern with automatic lifecycle management.

## Installation

```bash
npm install @prodforcode/event-forge-nestjs @prodforcode/event-forge-core
# or
pnpm add @prodforcode/event-forge-nestjs @prodforcode/event-forge-core
```

## Features

- **Automatic Polling Management**: Outbox polling starts automatically on application bootstrap and stops gracefully on shutdown
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
    },
    publisher: PublisherClass,
    lifecycle: {
      autoStart: true, // Default behavior
    },
  }),
});
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
