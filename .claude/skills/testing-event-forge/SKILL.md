---
name: testing-event-forge
description: Testing strategies for Event-Forge inbox-outbox pattern including testcontainers setup, repository mocking, message flow verification, and integration tests. Use when writing unit tests for outbox/inbox services, integration tests with real databases, or verifying transactional message delivery in distributed systems.
---

# Testing Event-Forge

Comprehensive testing strategies for the Transactional Inbox-Outbox pattern implementation.

## Testing Layers

```
┌─────────────────────────────────────────────────────────────┐
│  E2E Tests                                                   │
│  └── Full message flow: Create → Publish → Consume           │
├─────────────────────────────────────────────────────────────┤
│  Integration Tests                                           │
│  ├── Repository tests with testcontainers                   │
│  ├── Publisher tests with RabbitMQ container                │
│  └── Transaction rollback verification                       │
├─────────────────────────────────────────────────────────────┤
│  Unit Tests                                                  │
│  ├── OutboxService with mocked repository                   │
│  ├── InboxService with mocked repository                    │
│  └── Message status transitions                              │
└─────────────────────────────────────────────────────────────┘
```

## Unit Testing Core Services

### Mocking IOutboxRepository

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService, OUTBOX_REPOSITORY, IOutboxRepository } from '@prodforcode/event-forge-core';

describe('OutboxService', () => {
  let service: OutboxService;
  let mockRepository: jest.Mocked<IOutboxRepository>;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      fetchAndLockPending: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      withTransaction: jest.fn(),
      releaseLock: jest.fn(),
      releaseStaleLocks: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: OUTBOX_REPOSITORY, useValue: mockRepository },
        { provide: MESSAGE_PUBLISHER, useValue: { publish: jest.fn() } },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('should create outbox message', async () => {
    const dto = {
      aggregateType: 'Order',
      aggregateId: 'order-123',
      eventType: 'OrderCreated',
      payload: { amount: 100 },
    };

    mockRepository.create.mockResolvedValue({
      id: 'msg-1',
      ...dto,
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createMessage(dto);

    expect(mockRepository.create).toHaveBeenCalledWith(dto, undefined);
    expect(result.status).toBe('pending');
  });
});
```

### Testing Transaction Behavior

```typescript
describe('OutboxService.withTransaction', () => {
  it('should rollback on error', async () => {
    mockRepository.withTransaction.mockImplementation(async (operation) => {
      const mockContext = { rollback: jest.fn() };
      try {
        return await operation(mockContext);
      } catch (error) {
        mockContext.rollback();
        throw error;
      }
    });

    await expect(
      service.withTransaction(async () => {
        throw new Error('Business logic failed');
      })
    ).rejects.toThrow('Business logic failed');
  });

  it('should commit message with entity', async () => {
    const mockManager = {};
    mockRepository.withTransaction.mockImplementation((op) => op(mockManager));
    mockRepository.create.mockResolvedValue({ id: 'msg-1', status: 'pending' });

    await service.withTransaction(async (manager) => {
      await service.createMessage({
        aggregateType: 'Order',
        aggregateId: 'order-1',
        eventType: 'OrderCreated',
        payload: {},
      }, manager);
    });

    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.any(Object),
      mockManager,
    );
  });
});
```

### Testing Retry Logic

```typescript
describe('Retry Strategy', () => {
  it('should mark as pending with backoff after failure', async () => {
    const message = { id: 'msg-1', retryCount: 0, maxRetries: 5 };
    mockRepository.markFailed.mockResolvedValue(undefined);

    await service.handlePublishFailure(message, new Error('Broker unavailable'));

    expect(mockRepository.markFailed).toHaveBeenCalledWith(
      'msg-1',
      'Broker unavailable',
      false, // not permanent
    );
  });

  it('should mark as permanently_failed after max retries', async () => {
    const message = { id: 'msg-1', retryCount: 5, maxRetries: 5 };

    await service.handlePublishFailure(message, new Error('Max retries'));

    expect(mockRepository.markFailed).toHaveBeenCalledWith(
      'msg-1',
      expect.any(String),
      true, // permanent
    );
  });
});
```

## Integration Testing with Testcontainers

### PostgreSQL Container Setup

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

describe('TypeOrmOutboxRepository (Integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let repository: TypeOrmOutboxRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15')
      .withDatabase('test_db')
      .start();

    dataSource = new DataSource({
      type: 'postgres',
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      entities: [OutboxMessageEntity, InboxMessageEntity],
      synchronize: true,
    });

    await dataSource.initialize();
    repository = new TypeOrmOutboxRepository(dataSource);
  }, 60000);

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it('should lock messages with SKIP LOCKED', async () => {
    // Create test messages
    await repository.create({
      aggregateType: 'Order',
      aggregateId: 'order-1',
      eventType: 'OrderCreated',
      payload: { test: true },
    });

    // Lock messages from two processors
    const [locked1, locked2] = await Promise.all([
      repository.fetchAndLockPending(10, 'processor-1'),
      repository.fetchAndLockPending(10, 'processor-2'),
    ]);

    // Each processor gets different messages (SKIP LOCKED)
    const allIds = [...locked1, ...locked2].map(m => m.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
```

### MongoDB Container Setup

```typescript
import { MongoDBContainer, StartedMongoDBContainer } from '@testcontainers/mongodb';
import mongoose from 'mongoose';

describe('MongooseOutboxRepository (Integration)', () => {
  let container: StartedMongoDBContainer;
  let connection: mongoose.Connection;
  let repository: MongooseOutboxRepository;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7').start();

    connection = await mongoose.createConnection(container.getConnectionString(), {
      directConnection: true,
    }).asPromise();

    const OutboxModel = connection.model('OutboxMessage', OutboxMessageSchema);
    repository = new MongooseOutboxRepository(OutboxModel, connection);
  }, 60000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it('should use findOneAndUpdate for atomic locking', async () => {
    await repository.create({
      aggregateType: 'User',
      aggregateId: 'user-1',
      eventType: 'UserCreated',
      payload: { email: 'test@example.com' },
    });

    const locked = await repository.fetchAndLockPending(1, 'processor-1');

    expect(locked).toHaveLength(1);
    expect(locked[0].status).toBe('processing');
    expect(locked[0].lockedBy).toBe('processor-1');
  });
});
```

### RabbitMQ Container Setup

```typescript
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

describe('GolevelupPublisher (Integration)', () => {
  let container: StartedRabbitMQContainer;
  let connection: AmqpConnection;
  let publisher: GolevelupPublisher;

  beforeAll(async () => {
    container = await new RabbitMQContainer('rabbitmq:3-management')
      .withExposedPorts(5672, 15672)
      .start();

    connection = new AmqpConnection({
      uri: container.getAmqpUrl(),
      exchanges: [{ name: 'test.events', type: 'topic' }],
    });
    await connection.init();

    publisher = new GolevelupPublisher(connection, {
      exchange: 'test.events',
    });
  }, 60000);

  afterAll(async () => {
    await connection.close();
    await container.stop();
  });

  it('should publish message to exchange', async () => {
    const message = {
      id: 'msg-1',
      aggregateType: 'Order',
      aggregateId: 'order-1',
      eventType: 'OrderCreated',
      payload: { amount: 100 },
      status: 'processing',
      retryCount: 0,
      maxRetries: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await publisher.publish(message);

    expect(result).toBe(true);
  });
});
```

## Testing Message Deduplication

```typescript
describe('InboxService Deduplication', () => {
  it('should detect duplicate messages', async () => {
    const dto = {
      messageId: 'external-msg-123',
      source: 'payment-service',
      eventType: 'PaymentCompleted',
      payload: { orderId: 'order-1' },
    };

    // First record
    const first = await inboxRepository.record(dto);
    expect(first.isDuplicate).toBe(false);

    // Duplicate record
    const second = await inboxRepository.record(dto);
    expect(second.isDuplicate).toBe(true);
    expect(second.message.id).toBe(first.message.id);
  });
});
```

## Testing Lock Timeout and Stale Lock Release

```typescript
describe('Lock Management', () => {
  it('should release stale locks older than timeout', async () => {
    // Create and lock a message
    const message = await repository.create({
      aggregateType: 'Order',
      aggregateId: 'order-1',
      eventType: 'OrderCreated',
      payload: {},
    });

    await repository.fetchAndLockPending(1, 'crashed-processor');

    // Simulate time passage (30s lock timeout)
    const staleTime = new Date(Date.now() + 31000);

    const released = await repository.releaseStaleLocks(staleTime);

    expect(released).toBe(1);
  });
});
```

## Test Utilities

### Factory Functions

```typescript
// test/factories/outbox-message.factory.ts
export function createOutboxMessage(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: `msg-${Date.now()}`,
    aggregateType: 'Order',
    aggregateId: `order-${Date.now()}`,
    eventType: 'OrderCreated',
    payload: { test: true },
    status: 'pending',
    retryCount: 0,
    maxRetries: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  testTimeout: 60000, // For testcontainers
  moduleNameMapper: {
    '@prodforcode/event-forge-(.*)': '<rootDir>/packages/$1/src',
  },
};
```

## Reference Documentation

See [references/test-patterns.md](references/test-patterns.md) for additional test patterns and examples.
