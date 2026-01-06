# Inbox-Outbox Library Implementation Learnings

## Overview

This document captures key learnings from implementing the Universal Inbox-Outbox Library - a database-agnostic, pluggable implementation of the Transactional Inbox-Outbox pattern.

**Implementation Date**: January 2026
**Project**: Event-Forge
**Location**: `/inbox-outbox/`

---

## Architecture Decisions

### 1. Monorepo with Turborepo

**Decision**: Use Turborepo over Lerna for monorepo management.

**Rationale**:
- Faster builds with intelligent caching
- Better incremental builds
- Simpler configuration
- Modern tooling designed for TypeScript

**Implementation**:
```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

**Learning**: Turborepo's dependency-aware builds significantly speed up development by only rebuilding changed packages.

---

### 2. Database-Agnostic Core with Adapter Pattern

**Decision**: Separate core business logic from database implementations using repository interfaces.

**Pattern**:
```
Core Package (interfaces + services)
    ↓
Adapter Packages (database-specific implementations)
    ↓
Application (uses both)
```

**Key Interfaces**:
- `IOutboxRepository` - 8 methods for outbox persistence
- `IInboxRepository` - 6 methods for inbox persistence
- `IMessagePublisher` - 1 method for message publishing

**Learning**: Using `unknown` type for transaction context allows each adapter to use its native transaction type (EntityManager, ClientSession, etc.) while maintaining type safety at the adapter level.

---

### 3. Hybrid Processing: EventEmitter + Polling

**Decision**: Combine immediate processing via EventEmitter with fallback polling.

**Flow**:
```
1. Business transaction commits
2. EventEmitter.emit('outbox:created', messageId)
3. OutboxService immediately processes message
4. If missed, cron polls every 1 second as backup
```

**Benefits**:
- **Low Latency**: Messages processed immediately (sub-second)
- **Reliability**: Polling catches any missed events
- **No Message Loss**: Even if EventEmitter fails, polling recovers

**Implementation**:
```typescript
async createMessage(dto: CreateOutboxMessageDto, context?: unknown) {
  const message = await this.repository.create(dto, context);

  // Emit after transaction commits (important!)
  process.nextTick(() => {
    this.eventEmitter.emit('outbox:created', message.id);
  });

  return message;
}
```

**Learning**: Using `process.nextTick()` ensures the event is emitted after the transaction commits, preventing premature processing attempts.

---

### 4. PostgreSQL SKIP LOCKED for Concurrency

**Decision**: Use raw SQL with `FOR UPDATE SKIP LOCKED` instead of TypeORM query builder.

**Problem**: TypeORM doesn't support `SKIP LOCKED` natively, which is essential for concurrent worker safety.

**Solution**:
```typescript
async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
  const result = await this.dataSource.query(`
    UPDATE outbox_messages
    SET locked_by = $1, locked_at = $2, status = 'processing'
    WHERE id IN (
      SELECT id FROM outbox_messages
      WHERE status = 'pending'
        AND (scheduled_at IS NULL OR scheduled_at <= $2)
        AND (locked_at IS NULL OR locked_at < $3)
      ORDER BY created_at
      LIMIT $4
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `, [lockerId, now, lockTimeout, limit]);
  return result;
}
```

**Why SKIP LOCKED?**:
- Prevents workers from blocking each other
- No deadlocks
- Better throughput with multiple workers
- Workers automatically skip locked rows

**Learning**: For critical concurrency scenarios, raw SQL may be necessary even when using an ORM. Document this clearly and provide migration scripts.

---

### 5. MongoDB Atomic findOneAndUpdate Pattern

**Decision**: Use loop-based atomic updates for MongoDB instead of bulk operations.

**Pattern**:
```typescript
async fetchAndLockPending(limit: number, lockerId: string): Promise<OutboxMessage[]> {
  const messages: OutboxMessage[] = [];

  for (let i = 0; i < limit; i++) {
    const doc = await this.model.findOneAndUpdate(
      { status: 'pending', isLocked: false },
      { $set: { isLocked: true, lockedBy: lockerId, status: 'processing' } },
      { sort: { retryCount: 1, createdAt: 1 }, new: true }
    );

    if (!doc) break;
    messages.push(this.toOutboxMessage(doc));
  }

  return messages;
}
```

**Why Loop Instead of Bulk?**:
- MongoDB doesn't have bulk `findAndModify` with row-level locking
- `findOneAndUpdate` is atomic per document
- Each iteration locks exactly one message
- Safe for concurrent workers

**Trade-off**: Slightly less efficient than SQL `SKIP LOCKED`, but still safe and performant.

**Learning**: Different databases require different patterns for the same logical operation. Document performance characteristics.

---

### 6. Exponential Backoff with Jitter

**Decision**: Implement retry logic with exponential backoff and jitter to prevent thundering herd.

**Implementation**:
```typescript
private calculateBackoff(retryCount: number): number {
  const base = 5000;  // 5 seconds
  const delay = base * Math.pow(2, retryCount);  // 5s, 10s, 20s, 40s, 80s
  const jitter = Math.random() * 1000;  // Random 0-1000ms
  return delay + jitter;
}
```

**Retry Schedule**:
- Retry 0: ~5 seconds
- Retry 1: ~10 seconds
- Retry 2: ~20 seconds
- Retry 3: ~40 seconds
- Retry 4: ~80 seconds
- After max retries: `permanently_failed`

**Learning**: Jitter prevents all failed messages from retrying simultaneously after system recovery, smoothing load.

---

### 7. Transaction Context Type Safety

**Challenge**: Each database has different transaction types:
- TypeORM: `EntityManager`
- Mongoose: `ClientSession`
- SQLAlchemy: `Session`

**Solution**: Use `unknown` in interfaces, cast in adapters.

**Interface**:
```typescript
interface IOutboxRepository {
  withTransaction<T>(operation: (ctx: unknown) => Promise<T>): Promise<T>;
}
```

**Adapter**:
```typescript
// TypeORM
async withTransaction<T>(operation: (manager: EntityManager) => Promise<T>) {
  return this.dataSource.transaction(operation);
}

// Mongoose
async withTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  const session = await this.connection.startSession();
  try {
    session.startTransaction();
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } finally {
    await session.endSession();
  }
}
```

**Learning**: `unknown` type provides flexibility while maintaining type safety at the implementation level.

---

## Testing Strategies

### 1. Unit Tests with Mock Repositories

**Pattern**: Mock all dependencies, test business logic in isolation.

```typescript
describe('OutboxService', () => {
  let service: OutboxService;
  let mockRepository: jest.Mocked<IOutboxRepository>;
  let mockPublisher: jest.Mocked<IMessagePublisher>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      fetchAndLockPending: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      releaseLock: jest.fn(),
      releaseStaleLocks: jest.fn(),
      deleteOlderThan: jest.fn(),
      withTransaction: jest.fn(),
    } as jest.Mocked<IOutboxRepository>;

    mockPublisher = { publish: jest.fn() };

    service = new OutboxService(mockRepository, mockPublisher, defaultConfig);
  });

  it('should create message and emit event', async () => {
    const dto = { aggregateType: 'User', eventType: 'created', ... };
    mockRepository.create.mockResolvedValue(mockMessage);

    await service.createMessage(dto);

    expect(mockRepository.create).toHaveBeenCalledWith(dto, undefined);
    // Event emission happens in next tick
  });
});
```

**Key Learnings**:
- Mock ALL methods from interface to satisfy TypeScript
- Use `jest.Mocked<T>` type for type-safe mocks
- Test async behavior with `await` and promises
- Verify method calls, arguments, and call counts

---

### 2. Integration Tests with In-Memory Databases

**Pattern**: Use real database but in-memory for speed.

**TypeORM with SQLite**:
```typescript
describe('TypeOrmOutboxRepository', () => {
  let dataSource: DataSource;
  let repository: TypeOrmOutboxRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [OutboxMessageEntity, InboxMessageEntity],
      synchronize: true,
      dropSchema: true,
    });
    await dataSource.initialize();
    repository = new TypeOrmOutboxRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should lock messages with SKIP LOCKED behavior', async () => {
    // Create test messages
    await createTestMessages(dataSource);

    // Lock from worker 1
    const worker1Messages = await repository.fetchAndLockPending(5, 'worker-1');

    // Lock from worker 2 (should get different messages)
    const worker2Messages = await repository.fetchAndLockPending(5, 'worker-2');

    // Verify no overlap
    const worker1Ids = worker1Messages.map(m => m.id);
    const worker2Ids = worker2Messages.map(m => m.id);
    expect(worker1Ids).not.toEqual(expect.arrayContaining(worker2Ids));
  });
});
```

**Dependencies**:
```json
{
  "devDependencies": {
    "better-sqlite3": "^9.2.2",
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

**Learning**: In-memory SQLite is 100x faster than PostgreSQL testcontainers for unit/integration tests, but doesn't test PostgreSQL-specific features like `SKIP LOCKED`.

---

### 3. Timer Mocking in Jest

**Challenge**: Testing polling and cleanup intervals without waiting real time.

**Solution**: Use Jest fake timers with `advanceTimersByTime()`.

**Pattern**:
```typescript
describe('InboxService cleanup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    service.stopCleanup();
    jest.useRealTimers();
  });

  it('should delete old messages after interval', async () => {
    mockRepository.deleteOlderThan.mockResolvedValue(5);

    service.startCleanup();

    // Advance time by 1 hour
    jest.advanceTimersByTime(3600000);

    // Let async operations settle
    await Promise.resolve();

    expect(mockRepository.deleteOlderThan).toHaveBeenCalled();
  });
});
```

**Common Pitfall**: Using `jest.runAllTimersAsync()` with `setInterval` creates infinite loop.

**Fix**: Use `jest.advanceTimersByTime(N)` to advance by specific amount.

**Learning**: Fake timers require explicit async settling with `await Promise.resolve()` after advancing time.

---

### 4. Testing Race Conditions

**Pattern**: Create concurrent operations and verify atomicity.

```typescript
it('should handle concurrent deduplication', async () => {
  const dto = {
    messageId: 'msg-123',
    source: 'service-a',
    eventType: 'test',
    payload: {},
  };

  // Attempt to record same message concurrently
  const results = await Promise.allSettled([
    repository.record(dto),
    repository.record(dto),
    repository.record(dto),
  ]);

  // Exactly one should succeed, two should be duplicates
  const successful = results.filter(r =>
    r.status === 'fulfilled' && !r.value.isDuplicate
  );
  const duplicates = results.filter(r =>
    r.status === 'fulfilled' && r.value.isDuplicate
  );

  expect(successful).toHaveLength(1);
  expect(duplicates).toHaveLength(2);
});
```

**Learning**: Use `Promise.allSettled()` to test concurrent operations without short-circuiting on first failure.

---

## Porto Architecture Compliance

### 1. One Class Per File

**Pattern**: Every interface, class, error, and decorator in separate file.

```
interfaces/
├── outbox-message.interface.ts
├── inbox-message.interface.ts
├── create-outbox-message.dto.ts
├── create-inbox-message.dto.ts
├── outbox-repository.interface.ts
├── inbox-repository.interface.ts
└── message-publisher.interface.ts
```

**Learning**: Strict file separation improves navigability and testability. Each file has single responsibility.

---

### 2. No Exception Handling in Repositories

**Porto Rule**: Repositories should contain ONLY data access logic. NO try-catch blocks.

**Correct Pattern**:
```typescript
// Repository (NO try-catch)
async create(dto: CreateOutboxMessageDto, context?: unknown): Promise<OutboxMessage> {
  const repo = this.getRepository(context);
  const entity = repo.create({ ...dto, status: 'pending' });
  return repo.save(entity);  // Let exceptions bubble up
}

// Service (HAS try-catch)
async createMessage(dto: CreateOutboxMessageDto, context?: unknown): Promise<OutboxMessage> {
  try {
    const message = await this.repository.create(dto, context);
    this.logger.log(`Created outbox message: ${message.id}`);
    return message;
  } catch (error) {
    this.logger.error('Failed to create outbox message', error);
    throw error;
  }
}
```

**Learning**: Exception boundaries should be at service/action layer where business context exists for proper logging and handling.

---

### 3. Early Return Pattern

**Porto Rule**: No `else` after `return`.

**Bad**:
```typescript
if (condition) {
  return resultA;
} else {
  return resultB;
}
```

**Good**:
```typescript
if (condition) {
  return resultA;
}

return resultB;
```

**Learning**: Early returns reduce nesting and improve readability. Code after `return` is unreachable, making `else` redundant.

---

## NestJS Integration Patterns

### 1. Dynamic Module with forRoot/forRootAsync

**Pattern**: Provide both sync and async configuration.

```typescript
@Global()
@Module({})
export class InboxOutboxModule {
  static forRoot(options: InboxOutboxModuleOptions): DynamicModule {
    return {
      module: InboxOutboxModule,
      imports: [ScheduleModule.forRoot(), EventEmitterModule.forRoot()],
      providers: [
        options.outboxRepository,
        options.inboxRepository,
        options.messagePublisher,
        { provide: INBOX_OUTBOX_CONFIG, useValue: options.config },
        OutboxService,
        InboxService,
      ],
      exports: [OutboxService, InboxService],
    };
  }

  static forRootAsync(options: InboxOutboxModuleAsyncOptions): DynamicModule {
    return {
      module: InboxOutboxModule,
      imports: [...(options.imports || [])],
      providers: [
        {
          provide: 'INBOX_OUTBOX_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        // ... create providers from options
        OutboxService,
        InboxService,
      ],
      exports: [OutboxService, InboxService],
    };
  }
}
```

**Learning**: `forRootAsync` enables dependency injection of configuration, allowing dynamic setup based on environment, config service, etc.

---

### 2. DI Token Best Practices

**Pattern**: Use string tokens instead of class references for repositories.

```typescript
// constants.ts
export const OUTBOX_REPOSITORY = 'OUTBOX_REPOSITORY';
export const INBOX_REPOSITORY = 'INBOX_REPOSITORY';
export const MESSAGE_PUBLISHER = 'MESSAGE_PUBLISHER';

// service.ts
export class OutboxService {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private repository: IOutboxRepository,
    @Inject(MESSAGE_PUBLISHER) private publisher: IMessagePublisher,
  ) {}
}
```

**Why String Tokens?**:
- Interfaces don't exist at runtime (TypeScript)
- Allows swapping implementations without changing service
- Clear dependency contracts

**Learning**: String tokens + interface types provide best of both worlds: runtime flexibility + compile-time safety.

---

## Performance Optimizations

### 1. Database Indexes

**Critical Indexes for Outbox**:
```typescript
@Index(['status', 'scheduledAt', 'createdAt'])  // Composite for fetchAndLockPending
@Index(['aggregateType', 'aggregateId'])       // For queries by aggregate
@Index(['eventType'])                           // For filtering by event type
```

**Critical Indexes for Inbox**:
```typescript
@Index(['messageId', 'source'], { unique: true })  // Deduplication
@Index(['eventType'])                               // Handler lookup
@Index(['status', 'createdAt'])                     // Cleanup queries
```

**Learning**: Wrong index order matters! `['status', 'scheduledAt']` is NOT the same as `['scheduledAt', 'status']`. First column should be most selective.

---

### 2. Batch Processing

**Pattern**: Process multiple messages in single batch.

```typescript
async pollAndProcess(): Promise<void> {
  const messages = await this.repository.fetchAndLockPending(
    this.config.batchSize,  // Default: 10
    this.lockerId
  );

  await Promise.allSettled(
    messages.map(msg => this.publishMessage(msg))
  );
}
```

**Why `allSettled` not `all`?**:
- One failure doesn't stop other messages
- Failed messages retry independently
- Better fault isolation

**Learning**: Batch size is environment-dependent. High-throughput systems may use 50-100, low-latency systems may use 1-10.

---

### 3. Stale Lock Release

**Pattern**: Automatically release locks after timeout.

```typescript
async releaseStaleLocks(olderThan: Date): Promise<number> {
  const result = await this.repository.update(
    { lockedAt: LessThan(olderThan), status: 'processing' },
    { lockedBy: null, lockedAt: null, status: 'pending' }
  );
  return result.affected;
}

// Called periodically
@Cron('*/5 * * * *')  // Every 5 minutes
async cleanupStaleLocks() {
  const cutoff = new Date(Date.now() - this.lockTimeout);
  const released = await this.repository.releaseStaleLocks(cutoff);
  if (released > 0) {
    this.logger.warn(`Released ${released} stale locks`);
  }
}
```

**Learning**: Stale locks can occur due to crashes, network issues, or OOM kills. Automatic recovery prevents message starvation.

---

## Common Pitfalls and Solutions

### 1. EventEmitter Before Transaction Commit

**Problem**: Emitting event before transaction commits causes race condition.

**Bad**:
```typescript
async createMessage(dto) {
  const message = await this.repository.create(dto);
  this.eventEmitter.emit('outbox:created', message.id);  // ❌ TOO EARLY
  return message;
}
```

**Good**:
```typescript
async createMessage(dto) {
  const message = await this.repository.create(dto);
  process.nextTick(() => {
    this.eventEmitter.emit('outbox:created', message.id);  // ✅ AFTER COMMIT
  });
  return message;
}
```

**Learning**: `process.nextTick()` ensures event is emitted after current call stack completes, which is after transaction commit.

---

### 2. Missing Required Fields in Tests

**Problem**: DTOs missing required fields cause type errors.

**Bad**:
```typescript
const dto = {
  eventType: 'user.created',
  aggregateId: 'user-123',
  payload: {},
};  // ❌ Missing aggregateType
```

**Good**:
```typescript
const dto: CreateOutboxMessageDto = {
  aggregateType: 'User',  // ✅ All required fields
  eventType: 'user.created',
  aggregateId: 'user-123',
  payload: {},
};
```

**Learning**: Use explicit type annotation on test data to catch missing fields at compile time.

---

### 3. Infinite Timer Loops in Jest

**Problem**: `jest.runAllTimersAsync()` with `setInterval` causes infinite loop.

**Bad**:
```typescript
service.startCleanup();  // Sets up setInterval
await jest.runAllTimersAsync();  // ❌ INFINITE LOOP
```

**Good**:
```typescript
service.startCleanup();
jest.advanceTimersByTime(3600000);  // ✅ Advance 1 hour
await Promise.resolve();  // Let async settle
```

**Learning**: Use `advanceTimersByTime` for testing intervals, not `runAllTimers`.

---

## Key Takeaways

### 1. Architecture
- Separate interfaces from implementations for flexibility
- Use adapter pattern for database abstraction
- Hybrid EventEmitter + polling provides best reliability/latency
- Transaction context type as `unknown` enables adapter-specific typing

### 2. Database Patterns
- PostgreSQL: Use `SKIP LOCKED` for safe concurrency
- MongoDB: Use atomic `findOneAndUpdate` in loops
- Index design critical for query performance
- Stale lock cleanup prevents message starvation

### 3. Testing
- Mock all dependencies in unit tests
- Use in-memory databases for integration tests
- Test race conditions with `Promise.allSettled()`
- Use `advanceTimersByTime` for fake timers, not `runAllTimers`

### 4. Porto Architecture
- One file per class/interface
- No exception handling in repositories
- Early return pattern (no else after return)
- Services handle business logic and errors

### 5. NestJS
- Use dynamic modules for configurable libraries
- Provide both sync (forRoot) and async (forRootAsync) options
- String DI tokens for interface-based dependencies
- EventEmitter for decoupled communication

---

## Files Reference

**Core Package**:
- `/packages/core/src/interfaces/` - All interface definitions
- `/packages/core/src/services/outbox.service.ts` - Outbox service implementation
- `/packages/core/src/services/inbox.service.ts` - Inbox service implementation

**TypeORM Adapter**:
- `/packages/adapter-typeorm/src/entities/` - Entity definitions
- `/packages/adapter-typeorm/src/repositories/` - Repository implementations

**Tests**:
- `/packages/core/src/services/__tests__/` - Unit tests
- `/packages/adapter-typeorm/__tests__/integration/` - Integration tests

**Documentation**:
- `/inbox-outbox/README.md` - Main documentation
- `/inbox-outbox/TEST_SUMMARY.md` - Test suite overview
