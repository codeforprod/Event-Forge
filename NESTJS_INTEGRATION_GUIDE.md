# Event-Forge NestJS Integration Guide

Complete guide for integrating Event-Forge Inbox-Outbox pattern into NestJS applications.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic Setup](#basic-setup)
  - [PostgreSQL with TypeORM](#postgresql-with-typeorm)
  - [MongoDB with Mongoose](#mongodb-with-mongoose)
- [Module Configuration](#module-configuration)
- [Creating Outbox Messages](#creating-outbox-messages)
- [Processing Inbox Messages](#processing-inbox-messages)
- [RabbitMQ Consumer Integration](#rabbitmq-consumer-integration)
- [Advanced Configuration](#advanced-configuration)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: >= 18.0.0
- **NestJS**: >= 9.0.0
- **TypeScript**: >= 5.0.0
- **Database**: PostgreSQL 12+ or MongoDB 5.0+
- **Message Broker**: RabbitMQ 3.8+ (with `rabbitmq_delayed_message_exchange` plugin for delayed messages)

### RabbitMQ Plugin Installation

For delayed message support, install the RabbitMQ delayed message exchange plugin:

```bash
# Enable plugin
rabbitmq-plugins enable rabbitmq_delayed_message_exchange

# Restart RabbitMQ
rabbitmqctl restart
```

**Verify Installation:**

```bash
rabbitmq-plugins list | grep rabbitmq_delayed_message_exchange
```

Expected output: `[E*] rabbitmq_delayed_message_exchange`

---

## Installation

### Core Packages

```bash
npm install @prodforcode/event-forge-core @prodforcode/event-forge-nestjs
```

### Database Adapter (Choose One)

```bash
# For PostgreSQL with TypeORM
npm install @prodforcode/event-forge-typeorm @nestjs/typeorm typeorm

# For MongoDB with Mongoose
npm install @prodforcode/event-forge-mongoose @nestjs/mongoose mongoose
```

### Message Publisher

```bash
# For RabbitMQ
npm install @prodforcode/event-forge-rabbitmq amqplib

# For RabbitMQ Consumer (NEW in v1.1.0)
npm install @prodforcode/event-forge-rabbitmq-consumer @golevelup/nestjs-rabbitmq
```

---

## Basic Setup

### PostgreSQL with TypeORM

#### Step 1: Database Configuration

Create TypeORM data source configuration:

```typescript
// src/config/data-source.ts
import { DataSource } from 'typeorm';
import { OutboxMessageEntity, InboxMessageEntity } from '@prodforcode/event-forge-typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'myapp',
  entities: [
    OutboxMessageEntity,
    InboxMessageEntity,
    // Your application entities...
  ],
  migrations: ['src/migrations/**/*.ts'],
  synchronize: false, // ALWAYS false in production
  logging: process.env.NODE_ENV === 'development',
});
```

#### Step 2: Run Database Migrations

```bash
# Generate initial migration (first time only)
npx typeorm migration:generate src/migrations/InitialSchema -d src/config/data-source.ts

# Run migrations
npx typeorm migration:run -d src/config/data-source.ts
```

#### Step 3: Configure NestJS Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import {
  TypeOrmOutboxRepository,
  TypeOrmInboxRepository,
  OutboxMessageEntity,
  InboxMessageEntity,
} from '@prodforcode/event-forge-typeorm';
import { RabbitMQPublisher } from '@prodforcode/event-forge-rabbitmq';

@Module({
  imports: [
    // TypeORM configuration
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'myapp',
      entities: [OutboxMessageEntity, InboxMessageEntity, /* your entities */],
      synchronize: false,
    }),

    // Event-Forge module
    InboxOutboxModule.forRoot({
      outbox: {
        repository: TypeOrmOutboxRepository,
        config: {
          pollingInterval: 5000,      // Poll every 5 seconds
          batchSize: 10,               // Process 10 messages per batch
          maxRetries: 3,               // Retry failed messages 3 times
          backoffBaseSeconds: 5,       // Start with 5 second delay
          maxBackoffSeconds: 300,      // Cap at 5 minutes
          retentionDays: 7,            // Keep published messages for 7 days
        },
      },
      inbox: {
        repository: TypeOrmInboxRepository,
        config: {
          enableRetry: false,          // Disable retry by default (NEW in v1.1.0)
          retentionDays: 30,           // Keep processed messages for 30 days
        },
      },
      publisher: {
        type: RabbitMQPublisher,
        config: {
          url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
          exchange: 'events',
          exchangeType: 'topic',
          delayedExchange: 'events.delayed',
        },
      },
      lifecycle: {
        autoStart: true,  // Automatically start polling on app bootstrap
      },
    }),
  ],
})
export class AppModule {}
```

### MongoDB with Mongoose

#### Step 1: Configure NestJS Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import {
  MongooseOutboxRepository,
  MongooseInboxRepository,
  OutboxMessageSchema,
  InboxMessageSchema,
} from '@prodforcode/event-forge-mongoose';
import { RabbitMQPublisher } from '@prodforcode/event-forge-rabbitmq';

@Module({
  imports: [
    // Mongoose configuration
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp'
    ),

    // Register schemas
    MongooseModule.forFeature([
      { name: 'OutboxMessage', schema: OutboxMessageSchema },
      { name: 'InboxMessage', schema: InboxMessageSchema },
    ]),

    // Event-Forge module
    InboxOutboxModule.forRoot({
      outbox: {
        repository: MongooseOutboxRepository,
        config: {
          pollingInterval: 5000,
          batchSize: 10,
          maxRetries: 3,
          backoffBaseSeconds: 5,
          maxBackoffSeconds: 300,
          retentionDays: 7,
        },
      },
      inbox: {
        repository: MongooseInboxRepository,
        config: {
          enableRetry: false,
          retentionDays: 30,
        },
      },
      publisher: {
        type: RabbitMQPublisher,
        config: {
          url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
          exchange: 'events',
          exchangeType: 'topic',
          delayedExchange: 'events.delayed',
        },
      },
    }),
  ],
})
export class AppModule {}
```

---

## Module Configuration

### Synchronous Configuration (`forRoot`)

```typescript
InboxOutboxModule.forRoot({
  outbox: {
    repository: TypeOrmOutboxRepository,
    config: { /* outbox config */ },
  },
  inbox: {
    repository: TypeOrmInboxRepository,
    config: { /* inbox config */ },
  },
  publisher: {
    type: RabbitMQPublisher,
    config: { /* publisher config */ },
  },
  lifecycle: {
    autoStart: true,  // Optional: auto-start polling
  },
})
```

### Asynchronous Configuration (`forRootAsync`)

For dynamic configuration from environment variables or config service:

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';

InboxOutboxModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    outbox: {
      repository: TypeOrmOutboxRepository,
      config: {
        pollingInterval: configService.get('OUTBOX_POLLING_INTERVAL', 5000),
        batchSize: configService.get('OUTBOX_BATCH_SIZE', 10),
        maxRetries: configService.get('OUTBOX_MAX_RETRIES', 3),
        backoffBaseSeconds: configService.get('OUTBOX_BACKOFF_BASE', 5),
        maxBackoffSeconds: configService.get('OUTBOX_MAX_BACKOFF', 300),
        retentionDays: configService.get('OUTBOX_RETENTION_DAYS', 7),
      },
    },
    inbox: {
      repository: TypeOrmInboxRepository,
      config: {
        enableRetry: configService.get('INBOX_ENABLE_RETRY', false),
        maxRetries: configService.get('INBOX_MAX_RETRIES', 3),
        retryPollingInterval: configService.get('INBOX_RETRY_POLLING_INTERVAL', 5000),
        backoffBaseSeconds: configService.get('INBOX_BACKOFF_BASE', 2),
        maxBackoffSeconds: configService.get('INBOX_MAX_BACKOFF', 3600),
        retentionDays: configService.get('INBOX_RETENTION_DAYS', 30),
      },
    },
    publisher: {
      type: RabbitMQPublisher,
      config: {
        url: configService.get('RABBITMQ_URL'),
        exchange: configService.get('RABBITMQ_EXCHANGE', 'events'),
        exchangeType: configService.get('RABBITMQ_EXCHANGE_TYPE', 'topic'),
        delayedExchange: configService.get('RABBITMQ_DELAYED_EXCHANGE', 'events.delayed'),
      },
    },
    lifecycle: {
      autoStart: configService.get('EVENTFORGE_AUTO_START', true),
    },
  }),
})
```

### Configuration Options Reference

#### Outbox Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pollingInterval` | number | 5000 | Polling interval in milliseconds |
| `batchSize` | number | 10 | Number of messages per batch |
| `maxRetries` | number | 3 | Maximum retry attempts |
| `backoffBaseSeconds` | number | 5 | Base delay for exponential backoff (seconds) |
| `maxBackoffSeconds` | number | 300 | Maximum backoff delay (seconds) |
| `retentionDays` | number | 7 | Days to keep published messages |
| `lockTimeout` | number | 30000 | Message lock timeout (milliseconds) |

#### Inbox Configuration (NEW in v1.1.0)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableRetry` | boolean | false | Enable automatic retry for failed messages |
| `maxRetries` | number | 3 | Maximum retry attempts (when enabled) |
| `retryPollingInterval` | number | 5000 | Retry polling interval (milliseconds) |
| `backoffBaseSeconds` | number | 2 | Base delay for exponential backoff (seconds) |
| `maxBackoffSeconds` | number | 3600 | Maximum backoff delay (seconds) |
| `retryBatchSize` | number | 10 | Number of retry messages per batch |
| `retentionDays` | number | 30 | Days to keep processed messages |

---

## Creating Outbox Messages

### Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { OutboxService } from '@prodforcode/event-forge-core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class UserService {
  constructor(
    private readonly outboxService: OutboxService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createUser(email: string, name: string) {
    // Use withTransaction for automatic transaction management
    return this.outboxService.withTransaction(async (transactionContext) => {
      // 1. Save user to database
      const result = await this.dataSource.manager
        .createQueryBuilder(transactionContext)
        .insert()
        .into('users')
        .values({ email, name })
        .execute();

      const userId = result.identifiers[0].id;

      // 2. Create outbox message in same transaction
      await this.outboxService.createMessage(
        {
          aggregateType: 'User',
          aggregateId: userId,
          eventType: 'user.created',
          payload: { email, name, id: userId },
        },
        transactionContext,
      );

      return { id: userId, email, name };
    });
    // Transaction commits here
    // Message will be published immediately after commit
  }
}
```

### Manual Transaction Management

```typescript
async createUserManual(email: string, name: string) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Save user
    const result = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('users')
      .values({ email, name })
      .execute();

    const userId = result.identifiers[0].id;

    // 2. Create outbox message
    await this.outboxService.createMessage(
      {
        aggregateType: 'User',
        aggregateId: userId,
        eventType: 'user.created',
        payload: { email, name, id: userId },
      },
      queryRunner.manager, // Pass EntityManager as transaction context
    );

    // 3. Commit
    await queryRunner.commitTransaction();

    return { id: userId, email, name };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### Delayed Messages

Send messages with delay using metadata:

```typescript
await this.outboxService.createMessage(
  {
    aggregateType: 'Order',
    aggregateId: orderId,
    eventType: 'order.reminder',
    payload: { orderId, customerId },
    metadata: {
      delay: 3600000, // 1 hour delay (milliseconds)
    },
  },
  transactionContext,
);
```

**Requirements for Delayed Messages:**

- RabbitMQ delayed message exchange plugin installed
- `delayedExchange` configured in publisher config
- `delay` value is a positive number (milliseconds)

### Custom Routing

Override default routing key and exchange:

```typescript
await this.outboxService.createMessage(
  {
    aggregateType: 'Notification',
    aggregateId: notificationId,
    eventType: 'notification.urgent',
    payload: { message: 'System alert!' },
    metadata: {
      routingKey: 'notifications.urgent.critical', // Custom routing key
      exchange: 'priority-events',                  // Custom exchange
    },
  },
  transactionContext,
);
```

---

## Processing Inbox Messages

### Manual Message Processing

```typescript
import { Injectable } from '@nestjs/common';
import { InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class OrderEventHandler {
  constructor(private readonly inboxService: InboxService) {}

  async handleExternalOrderEvent(externalMessage: any) {
    // Process with automatic deduplication
    const result = await this.inboxService.receiveMessage({
      messageId: externalMessage.id,      // External message ID
      source: 'payment-service',          // Source system
      eventType: 'order.paid',
      payload: externalMessage.data,
    });

    if (result.isDuplicate) {
      console.log('Duplicate message, skipped processing');
      return;
    }

    console.log('Message processed successfully');
  }
}
```

### Event Handlers (Optional)

Register handlers for specific event types:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class EventHandlers implements OnModuleInit {
  constructor(private readonly inboxService: InboxService) {}

  onModuleInit() {
    // Register handler for order.paid events
    this.inboxService.registerHandler('order.paid', async (message) => {
      console.log('Order paid:', message.payload);
      // Your business logic here
    });

    // Register handler for user.created events
    this.inboxService.registerHandler('user.created', async (message) => {
      console.log('User created:', message.payload);
      // Your business logic here
    });
  }
}
```

### Enabling Inbox Retry (NEW in v1.1.0)

Enable automatic retry for failed inbox messages:

```typescript
InboxOutboxModule.forRoot({
  inbox: {
    repository: TypeOrmInboxRepository,
    config: {
      enableRetry: true,              // Enable retry mechanism
      maxRetries: 3,                  // Retry up to 3 times
      retryPollingInterval: 5000,     // Poll every 5 seconds
      backoffBaseSeconds: 2,          // Start with 2 second delay
      maxBackoffSeconds: 3600,        // Cap at 1 hour
      retryBatchSize: 10,             // Process 10 retry messages per batch
    },
  },
})
```

**Retry Behavior:**

- Failed messages are retried with exponential backoff
- Formula: `min(base * 2^retryCount, maxBackoff) + jitter(±10%)`
- Example delays: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 512s, 1024s (capped at 3600s)
- After `maxRetries` attempts, message status becomes `permanently_failed`

---

## RabbitMQ Consumer Integration

**NEW in v1.1.0:** Automatic INBOX recording for RabbitMQ messages.

### Installation

```bash
npm install @prodforcode/event-forge-rabbitmq-consumer @golevelup/nestjs-rabbitmq
```

### Module Setup

```typescript
import { Module } from '@nestjs/common';
import { InboxConsumerModule } from '@prodforcode/event-forge-rabbitmq-consumer';
import { TypeOrmInboxRepository } from '@prodforcode/event-forge-typeorm';

@Module({
  imports: [
    // Configure RabbitMQ consumer with INBOX integration
    InboxConsumerModule.forRoot({
      rabbitmq: {
        uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        exchanges: [
          {
            name: 'events',
            type: 'topic',
          },
        ],
      },
      inbox: {
        repository: TypeOrmInboxRepository,
      },
      defaultSource: 'external-service', // Default source for INBOX records
    }),
  ],
  providers: [OrderEventConsumer],
})
export class OrderModule {}
```

### Using @InboxSubscribe Decorator

```typescript
import { Injectable } from '@nestjs/common';
import { InboxSubscribe } from '@prodforcode/event-forge-rabbitmq-consumer';

@Injectable()
export class OrderEventConsumer {

  @InboxSubscribe({
    exchange: 'events',
    routingKey: 'order.created',
    queue: 'order-service.order.created',
    source: 'payment-service',  // Source for INBOX record
  })
  async handleOrderCreated(message: any) {
    // INBOX record is automatically created BEFORE this handler executes
    // Duplicate messages are automatically filtered out

    console.log('Processing order:', message);

    // Your business logic here
    // If this throws an error, INBOX record will be marked as 'failed'
  }

  @InboxSubscribe({
    exchange: 'events',
    routingKey: 'user.*',
    queue: 'order-service.user-events',
    queueOptions: {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // 24 hours
      },
    },
  })
  async handleUserEvents(message: any) {
    console.log('User event:', message);
  }
}
```

**How @InboxSubscribe Works:**

1. **Decorator Registration**: Marks method with metadata
2. **Service Discovery**: `InboxConsumerService` finds all decorated methods at module init
3. **Handler Wrapping**: Original handler is wrapped with INBOX logic
4. **Automatic INBOX**: Before handler execution:
   - Extract `messageId` from RabbitMQ message properties
   - Call `inboxRepository.record()` to create INBOX entry
   - Check if message is duplicate
   - If duplicate: skip handler, log warning, acknowledge message
   - If new: execute original handler
5. **Status Tracking**: Handler success/failure updates INBOX status

### Async Module Configuration

```typescript
InboxConsumerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    rabbitmq: {
      uri: configService.get('RABBITMQ_URL'),
      exchanges: [
        {
          name: configService.get('RABBITMQ_EXCHANGE', 'events'),
          type: 'topic',
        },
      ],
    },
    inbox: {
      repository: TypeOrmInboxRepository,
    },
    defaultSource: configService.get('SERVICE_NAME', 'unknown'),
    logging: configService.get('NODE_ENV') === 'development',
  }),
})
```

---

## Advanced Configuration

### Custom Message Publisher

Implement `IMessagePublisher` interface:

```typescript
import { Injectable } from '@nestjs/common';
import { IMessagePublisher, OutboxMessage } from '@prodforcode/event-forge-core';

@Injectable()
export class KafkaPublisher implements IMessagePublisher {
  async publish(message: OutboxMessage, options?: any): Promise<boolean> {
    try {
      await this.kafkaProducer.send({
        topic: message.aggregateType,
        messages: [{
          key: message.aggregateId,
          value: JSON.stringify(message.payload),
        }],
      });
      return true;
    } catch (error) {
      console.error('Kafka publish error:', error);
      return false;
    }
  }

  async connect(): Promise<void> {
    await this.kafkaProducer.connect();
  }

  async disconnect(): Promise<void> {
    await this.kafkaProducer.disconnect();
  }
}
```

Use custom publisher in module:

```typescript
InboxOutboxModule.forRoot({
  // ... other config
  publisher: {
    type: KafkaPublisher,
    config: { /* Kafka config */ },
  },
})
```

### Disable Auto-Start (Manual Lifecycle Control)

```typescript
InboxOutboxModule.forRoot({
  // ... other config
  lifecycle: {
    autoStart: false,  // Disable automatic startup
  },
})
```

Manually control lifecycle in your service:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OutboxService, InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class AppLifecycleService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly inboxService: InboxService,
  ) {}

  async onModuleInit() {
    // Custom startup logic
    console.log('Starting Event-Forge services...');

    await this.outboxService.startPolling();

    // Conditionally start inbox retry polling
    if (process.env.INBOX_RETRY_ENABLED === 'true') {
      await this.inboxService.startRetryPolling();
    }
  }

  async onModuleDestroy() {
    console.log('Stopping Event-Forge services...');

    await this.outboxService.stopPolling();
    await this.inboxService.stopRetryPolling();
  }
}
```

---

## Testing

### Unit Testing Services

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from '@prodforcode/event-forge-core';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let outboxService: OutboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: OutboxService,
          useValue: {
            createMessage: jest.fn().mockResolvedValue({}),
            withTransaction: jest.fn((callback) => callback({})),
          },
        },
        {
          provide: DataSource,
          useValue: {
            manager: {
              createQueryBuilder: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    outboxService = module.get<OutboxService>(OutboxService);
  });

  it('should create user and outbox message', async () => {
    const user = await service.createUser('test@example.com', 'Test User');

    expect(user).toBeDefined();
    expect(outboxService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'User',
        eventType: 'user.created',
      }),
      expect.anything(),
    );
  });
});
```

### Integration Testing

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InboxOutboxModule } from '@prodforcode/event-forge-nestjs';
import { OutboxService } from '@prodforcode/event-forge-core';

describe('Event-Forge Integration', () => {
  let module: TestingModule;
  let outboxService: OutboxService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5433, // Test database
          username: 'test',
          password: 'test',
          database: 'test_db',
          entities: [/* entities */],
          synchronize: true, // OK for testing
        }),
        InboxOutboxModule.forRoot({
          // Test configuration
        }),
      ],
    }).compile();

    outboxService = module.get<OutboxService>(OutboxService);
    await module.init();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should create and publish outbox message', async () => {
    const message = await outboxService.createMessage({
      aggregateType: 'Test',
      aggregateId: '123',
      eventType: 'test.created',
      payload: { test: true },
    });

    expect(message.id).toBeDefined();
    expect(message.status).toBe('pending');
  });
});
```

---

## Production Deployment

### Environment Variables

Create `.env` file:

```bash
# Database
DB_HOST=postgres.example.com
DB_PORT=5432
DB_USERNAME=app_user
DB_PASSWORD=secure_password
DB_DATABASE=production_db

# RabbitMQ
RABBITMQ_URL=amqp://user:password@rabbitmq.example.com:5672
RABBITMQ_EXCHANGE=events
RABBITMQ_DELAYED_EXCHANGE=events.delayed

# Outbox Configuration
OUTBOX_POLLING_INTERVAL=5000
OUTBOX_BATCH_SIZE=20
OUTBOX_MAX_RETRIES=5
OUTBOX_BACKOFF_BASE=10
OUTBOX_MAX_BACKOFF=600
OUTBOX_RETENTION_DAYS=7

# Inbox Configuration (NEW in v1.1.0)
INBOX_ENABLE_RETRY=true
INBOX_MAX_RETRIES=3
INBOX_RETRY_POLLING_INTERVAL=5000
INBOX_BACKOFF_BASE=5
INBOX_MAX_BACKOFF=3600
INBOX_RETENTION_DAYS=30

# Event-Forge
EVENTFORGE_AUTO_START=true
```

### Docker Compose Example

```yaml
version: '3.8'

services:
  app:
    image: myapp:latest
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
      - OUTBOX_POLLING_INTERVAL=5000
      - INBOX_ENABLE_RETRY=true
    depends_on:
      - postgres
      - rabbitmq

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=myapp
      - POSTGRES_USER=app_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  rabbitmq:
    image: rabbitmq:3.12-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq

volumes:
  postgres_data:
  rabbitmq_data:
```

### Health Checks

Implement health check endpoint:

```typescript
import { Controller, Get } from '@nestjs/common';
import { OutboxService, InboxService } from '@prodforcode/event-forge-core';

@Controller('health')
export class HealthController {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly inboxService: InboxService,
  ) {}

  @Get()
  async check() {
    // Check if services are running
    const outboxRunning = this.outboxService.isPolling();
    const inboxRetryRunning = this.inboxService.isRetryPolling();

    return {
      status: 'ok',
      eventForge: {
        outbox: {
          polling: outboxRunning,
        },
        inbox: {
          retryPolling: inboxRetryRunning,
        },
      },
    };
  }
}
```

### Monitoring and Logging

Add structured logging:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OutboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class EventForgeMonitor {
  private readonly logger = new Logger(EventForgeMonitor.name);

  constructor(private readonly outboxService: OutboxService) {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.outboxService.on('outbox:created', (message) => {
      this.logger.log(`Outbox message created: ${message.id}`);
    });

    this.outboxService.on('outbox:published', (message) => {
      this.logger.log(`Outbox message published: ${message.id}`);
    });

    this.outboxService.on('outbox:failed', ({ message, error }) => {
      this.logger.error(`Outbox message failed: ${message.id}`, error);
    });
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. Messages Not Being Published

**Symptoms:** Outbox messages stay in `pending` status

**Checks:**
```typescript
// Check if polling is running
const isPolling = outboxService.isPolling();
console.log('Outbox polling:', isPolling);

// Check RabbitMQ connection
await publisher.connect();
```

**Solutions:**
- Ensure `lifecycle.autoStart` is `true` or manually start polling
- Verify RabbitMQ connection string
- Check RabbitMQ exchange exists
- Review application logs for errors

#### 2. Duplicate Messages Being Processed

**Symptoms:** Same external message processed multiple times

**Checks:**
```sql
-- Check for duplicate INBOX records
SELECT message_id, source, COUNT(*)
FROM inbox_messages
GROUP BY message_id, source
HAVING COUNT(*) > 1;
```

**Solutions:**
- Ensure unique `messageId` from external system
- Verify INBOX deduplication is working
- Check database unique constraint on `(message_id, source)`

#### 3. Migration Errors (NEW in v1.1.0)

**Symptoms:** Error running migrations after upgrade

**Checks:**
```bash
# List migration status
npx event-forge migration:list --data-source=./src/config/data-source.ts
```

**Solutions:**
- Run pending migrations: `npx event-forge migration:run`
- For existing projects upgrading from v1.0.5, see [Migration Guide](./MIGRATION_GUIDE_v1.0.5_to_v1.1.0.md)

#### 4. Delayed Messages Not Working

**Symptoms:** Delayed messages publish immediately

**Checks:**
```bash
# Verify RabbitMQ plugin
rabbitmq-plugins list | grep rabbitmq_delayed_message_exchange
```

**Solutions:**
- Install `rabbitmq_delayed_message_exchange` plugin
- Configure `delayedExchange` in publisher config
- Ensure `metadata.delay` is a positive number

#### 5. High Database Load from Polling

**Symptoms:** High CPU/disk I/O on database

**Solutions:**
- Increase `pollingInterval` (reduce polling frequency)
- Decrease `batchSize` (process fewer messages per poll)
- Add database indexes (already included in migrations)
- Consider horizontal scaling with multiple app instances

### Debug Mode

Enable detailed logging:

```typescript
InboxOutboxModule.forRoot({
  // ... config
  logging: {
    level: 'debug',
    enabled: true,
  },
})
```

### Performance Tuning

**For High-Volume Systems:**

```typescript
{
  outbox: {
    config: {
      pollingInterval: 1000,      // Poll more frequently
      batchSize: 50,              // Process more messages per batch
      maxRetries: 5,              // More retry attempts
      backoffBaseSeconds: 2,      // Faster initial retry
    },
  },
  inbox: {
    config: {
      enableRetry: true,
      retryPollingInterval: 2000,
      retryBatchSize: 50,
    },
  },
}
```

**For Low-Volume Systems:**

```typescript
{
  outbox: {
    config: {
      pollingInterval: 30000,     // Poll less frequently
      batchSize: 5,               // Smaller batches
      maxRetries: 3,
    },
  },
  inbox: {
    config: {
      enableRetry: false,         // Disable retry if not needed
    },
  },
}
```

---

## Next Steps

- **Migration Guide**: [Upgrading from v1.0.5 to v1.1.0](./MIGRATION_GUIDE_v1.0.5_to_v1.1.0.md)
- **API Reference**: See package READMEs
- **Examples**: Check `examples/` directory in repository
- **Support**: GitHub Issues or Discussions

---

## Additional Resources

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [Mongoose Documentation](https://mongoosejs.com)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
