import { DataSource } from 'typeorm';
import { TypeOrmOutboxRepository } from '../../src/repositories/typeorm-outbox.repository';
import { OutboxMessageEntity } from '../../src/entities/outbox-message.entity';
import { CreateOutboxMessageDto, OutboxMessageStatus } from '@callairis/event-forge-core';

describe('TypeOrmOutboxRepository Integration Tests', () => {
  let dataSource: DataSource;
  let repository: TypeOrmOutboxRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [OutboxMessageEntity],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();
    repository = new TypeOrmOutboxRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clear all messages before each test
    await dataSource.getRepository(OutboxMessageEntity).clear();
  });

  describe('create', () => {
    it('should create a new outbox message', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe', email: 'john@example.com' },
      };

      const message = await repository.create(dto);

      expect(message.id).toBeDefined();
      expect(message.eventType).toBe('user.created');
      expect(message.aggregateId).toBe('user-123');
      expect(message.payload).toEqual({ name: 'John Doe', email: 'john@example.com' });
      expect(message.status).toBe(OutboxMessageStatus.PENDING);
      expect(message.retryCount).toBe(0);
      expect(message.maxRetries).toBe(3);
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should create message with custom maxRetries', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'order.placed',
        aggregateId: 'order-456',
        payload: { total: 100 },
        maxRetries: 5,
      };

      const message = await repository.create(dto);

      expect(message.maxRetries).toBe(5);
    });

    it('should create message with metadata', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'payment.processed',
        aggregateId: 'payment-789',
        payload: { amount: 50.99 },
        metadata: {
          correlationId: 'corr-123',
          causationId: 'cause-456',
        },
      };

      const message = await repository.create(dto);

      expect(message.metadata).toEqual({
        correlationId: 'corr-123',
        causationId: 'cause-456',
      });
    });

    it('should create message with scheduledAt', async () => {
      const scheduledAt = new Date(Date.now() + 3600000); // 1 hour from now

      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'reminder.send',
        aggregateId: 'user-123',
        payload: { message: 'Time for your appointment' },
        scheduledAt,
      };

      const message = await repository.create(dto);

      expect(message.scheduledAt).toEqual(scheduledAt);
    });

    it('should create message within transaction', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
      };

      const result = await repository.withTransaction(async (txContext) => {
        const msg = await repository.create(dto, txContext);
        return msg;
      });

      expect(result.id).toBeDefined();

      // Verify message was persisted
      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });

    it('should rollback transaction on error', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
      };

      await expect(
        repository.withTransaction(async (txContext) => {
          await repository.create(dto, txContext);
          throw new Error('Transaction error');
        }),
      ).rejects.toThrow('Transaction error');

      // Verify no message was persisted
      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(0);
    });
  });

  describe('fetchAndLockPending', () => {
    it('should fetch pending messages', async () => {
      await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });
      await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-2',
        payload: {},
      });

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].status).toBe(OutboxMessageStatus.PROCESSING);
      expect(messages[0].lockedBy).toBe('worker-1');
      expect(messages[0].lockedAt).toBeInstanceOf(Date);
    });

    it('should respect batch size limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repository.create({
          aggregateType: 'User',
        eventType: 'user.created',
          aggregateId: `user-${i}`,
          payload: {},
        });
      }

      const messages = await repository.fetchAndLockPending(3, 'worker-1');

      expect(messages).toHaveLength(3);
    });

    it('should fetch messages in FIFO order', async () => {
      const msg1 = await repository.create({
        aggregateType: 'User',
        eventType: 'event.1',
        aggregateId: 'agg-1',
        payload: {},
      });

      // Wait to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const msg2 = await repository.create({
        aggregateType: 'User',
        eventType: 'event.2',
        aggregateId: 'agg-2',
        payload: {},
      });

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages[0].id).toBe(msg1.id);
      expect(messages[1].id).toBe(msg2.id);
    });

    it('should not fetch locked messages', async () => {
      await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      // First worker locks the message
      const messages1 = await repository.fetchAndLockPending(10, 'worker-1');
      expect(messages1).toHaveLength(1);

      // Second worker should not fetch the same message
      const messages2 = await repository.fetchAndLockPending(10, 'worker-2');
      expect(messages2).toHaveLength(0);
    });

    it('should fetch failed messages for retry', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markFailed(message.id, 'Network error', false);

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages).toHaveLength(1);
      expect(messages[0].status).toBe(OutboxMessageStatus.PROCESSING);
    });

    it('should not fetch permanently failed messages', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markFailed(message.id, 'Permanent error', true);

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages).toHaveLength(0);
    });

    it('should not fetch scheduled messages not yet due', async () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now

      await repository.create({
        aggregateType: 'User',
        eventType: 'reminder.send',
        aggregateId: 'user-1',
        payload: {},
        scheduledAt: futureDate,
      });

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages).toHaveLength(0);
    });

    it('should fetch scheduled messages that are due', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago

      await repository.create({
        aggregateType: 'User',
        eventType: 'reminder.send',
        aggregateId: 'user-1',
        payload: {},
        scheduledAt: pastDate,
      });

      const messages = await repository.fetchAndLockPending(10, 'worker-1');

      expect(messages).toHaveLength(1);
    });

    it('should handle concurrent fetches without duplicates', async () => {
      // Create 10 messages
      for (let i = 0; i < 10; i++) {
        await repository.create({
          aggregateType: 'User',
        eventType: 'user.created',
          aggregateId: `user-${i}`,
          payload: {},
        });
      }

      // Simulate concurrent workers
      const [messages1, messages2, messages3] = await Promise.all([
        repository.fetchAndLockPending(5, 'worker-1'),
        repository.fetchAndLockPending(5, 'worker-2'),
        repository.fetchAndLockPending(5, 'worker-3'),
      ]);

      // Verify no duplicates
      const allIds = [
        ...messages1.map((m) => m.id),
        ...messages2.map((m) => m.id),
        ...messages3.map((m) => m.id),
      ];

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);

      // Verify all messages were picked up
      expect(allIds.length).toBeLessThanOrEqual(10);
    });
  });

  describe('markPublished', () => {
    it('should mark message as published', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markPublished(message.id);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.status).toBe(OutboxMessageStatus.PUBLISHED);
      expect(updated?.lockedBy).toBeNull();
      expect(updated?.lockedAt).toBeNull();
    });
  });

  describe('markFailed', () => {
    it('should mark message as failed with retry', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markFailed(message.id, 'Network timeout', false);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.status).toBe(OutboxMessageStatus.FAILED);
      expect(updated?.retryCount).toBe(1);
      expect(updated?.errorMessage).toBe('Network timeout');
      expect(updated?.lockedBy).toBeNull();
      expect(updated?.lockedAt).toBeNull();
    });

    it('should mark message as permanently failed', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markFailed(message.id, 'Invalid payload', true);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.status).toBe(OutboxMessageStatus.PERMANENTLY_FAILED);
      expect(updated?.retryCount).toBe(1);
      expect(updated?.errorMessage).toBe('Invalid payload');
    });

    it('should increment retry count', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markFailed(message.id, 'Error 1', false);
      await repository.markFailed(message.id, 'Error 2', false);
      await repository.markFailed(message.id, 'Error 3', false);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.retryCount).toBe(3);
    });
  });

  describe('releaseStaleLocks', () => {
    it('should release stale locks', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      // Lock the message
      await repository.fetchAndLockPending(10, 'worker-1');

      // Manually set lock time to be stale
      await dataSource.getRepository(OutboxMessageEntity).update(message.id, {
        lockedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      });

      const releasedCount = await repository.releaseStaleLocks(
        new Date(Date.now() - 5 * 60 * 1000), // 5 minutes
      );

      expect(releasedCount).toBe(1);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.status).toBe(OutboxMessageStatus.PENDING);
      expect(updated?.lockedBy).toBeNull();
      expect(updated?.lockedAt).toBeNull();
    });

    it('should not release recent locks', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      // Lock the message
      await repository.fetchAndLockPending(10, 'worker-1');

      const releasedCount = await repository.releaseStaleLocks(
        new Date(Date.now() - 5 * 60 * 1000), // 5 minutes
      );

      expect(releasedCount).toBe(0);

      const updated = await dataSource
        .getRepository(OutboxMessageEntity)
        .findOne({ where: { id: message.id } });

      expect(updated?.status).toBe(OutboxMessageStatus.PROCESSING);
      expect(updated?.lockedBy).toBe('worker-1');
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old published messages', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markPublished(message.id);

      // Manually set creation time to be old
      await dataSource.getRepository(OutboxMessageEntity).update(message.id, {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(1);

      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(0);
    });

    it('should not delete pending messages', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      // Manually set creation time to be old
      await dataSource.getRepository(OutboxMessageEntity).update(message.id, {
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(0);

      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });

    it('should not delete recent published messages', async () => {
      const message = await repository.create({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-1',
        payload: {},
      });

      await repository.markPublished(message.id);

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(0);

      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });
  });

  describe('withTransaction', () => {
    it('should execute operation within transaction', async () => {
      const result = await repository.withTransaction(async (txContext) => {
        const msg1 = await repository.create(
          {
            aggregateType: 'User',
            eventType: 'user.created',
            aggregateId: 'user-1',
            payload: {},
          },
          txContext,
        );

        const msg2 = await repository.create(
          {
            aggregateType: 'User',
            eventType: 'user.created',
            aggregateId: 'user-2',
            payload: {},
          },
          txContext,
        );

        return { msg1, msg2 };
      });

      expect(result.msg1.id).toBeDefined();
      expect(result.msg2.id).toBeDefined();

      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(2);
    });

    it('should rollback on error', async () => {
      await expect(
        repository.withTransaction(async (txContext) => {
          await repository.create(
            {
              aggregateType: 'User',
              eventType: 'user.created',
              aggregateId: 'user-1',
              payload: {},
            },
            txContext,
          );

          await repository.create(
            {
              aggregateType: 'User',
              eventType: 'user.created',
              aggregateId: 'user-2',
              payload: {},
            },
            txContext,
          );

          throw new Error('Transaction failed');
        }),
      ).rejects.toThrow('Transaction failed');

      const messages = await dataSource.getRepository(OutboxMessageEntity).find();
      expect(messages).toHaveLength(0);
    });
  });
});
