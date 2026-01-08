import { DataSource } from 'typeorm';
import { TypeOrmInboxRepository } from '../../src/repositories/typeorm-inbox.repository';
import { InboxMessageEntity } from '../../src/entities/inbox-message.entity';
import { CreateInboxMessageDto, InboxMessageStatus } from '@prodforcode/event-forge-core';

describe('TypeOrmInboxRepository Integration Tests', () => {
  let dataSource: DataSource;
  let repository: TypeOrmInboxRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [InboxMessageEntity],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();
    repository = new TypeOrmInboxRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clear all messages before each test
    await dataSource.getRepository(InboxMessageEntity).clear();
  });

  describe('record', () => {
    it('should record a new message', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe', email: 'john@example.com' },
      };

      const result = await repository.record(dto);

      expect(result.isDuplicate).toBe(false);
      expect(result.message.id).toBeDefined();
      expect(result.message.messageId).toBe('msg-123');
      expect(result.message.source).toBe('user-service');
      expect(result.message.eventType).toBe('user.created');
      expect(result.message.payload).toEqual({ name: 'John Doe', email: 'john@example.com' });
      expect(result.message.status).toBe(InboxMessageStatus.RECEIVED);
      expect(result.message.receivedAt).toBeInstanceOf(Date);
    });

    it('should detect duplicate messages', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      // Record first message
      const result1 = await repository.record(dto);
      expect(result1.isDuplicate).toBe(false);

      // Try to record duplicate
      const result2 = await repository.record(dto);
      expect(result2.isDuplicate).toBe(true);
      expect(result2.message.id).toBe(result1.message.id);
    });

    it('should handle concurrent duplicate detection', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-concurrent',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      // Simulate concurrent record attempts
      const results = await Promise.allSettled([
        repository.record(dto),
        repository.record(dto),
        repository.record(dto),
      ]);

      // Count successful inserts
      const successful = results.filter(
        (r) => r.status === 'fulfilled' && !r.value.isDuplicate,
      );

      // Exactly one should succeed
      expect(successful).toHaveLength(1);

      // Verify only one message was created
      const allMessages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(allMessages).toHaveLength(1);
    });

    it('should allow same messageId from different sources', async () => {
      const dto1: CreateInboxMessageDto = {
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      const dto2: CreateInboxMessageDto = {
        messageId: 'msg-123',
        source: 'order-service',
        eventType: 'order.created',
        payload: { total: 100 },
      };

      const result1 = await repository.record(dto1);
      const result2 = await repository.record(dto2);

      expect(result1.isDuplicate).toBe(false);
      expect(result2.isDuplicate).toBe(false);
      expect(result1.message.id).not.toBe(result2.message.id);

      const allMessages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(allMessages).toHaveLength(2);
    });

    it('should handle large payloads', async () => {
      const largePayload = {
        data: Array(1000)
          .fill(null)
          .map((_, i) => ({ id: i, value: `value-${i}` })),
      };

      const dto: CreateInboxMessageDto = {
        messageId: 'msg-large',
        source: 'user-service',
        eventType: 'data.imported',
        payload: largePayload,
      };

      const result = await repository.record(dto);

      expect(result.isDuplicate).toBe(false);
      expect(result.message.payload).toEqual(largePayload);
    });
  });

  describe('exists', () => {
    it('should return true for existing message', async () => {
      await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      const exists = await repository.exists('msg-123', 'user-service');

      expect(exists).toBe(true);
    });

    it('should return false for non-existing message', async () => {
      const exists = await repository.exists('msg-999', 'user-service');

      expect(exists).toBe(false);
    });

    it('should distinguish between different sources', async () => {
      await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      const existsUserService = await repository.exists('msg-123', 'user-service');
      const existsOrderService = await repository.exists('msg-123', 'order-service');

      expect(existsUserService).toBe(true);
      expect(existsOrderService).toBe(false);
    });
  });

  describe('markProcessing', () => {
    it('should mark message as processing', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markProcessing(result.message.id);

      const updated = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(updated?.status).toBe(InboxMessageStatus.PROCESSING);
    });
  });

  describe('markProcessed', () => {
    it('should mark message as processed with timestamp', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markProcessed(result.message.id);

      const updated = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(updated?.status).toBe(InboxMessageStatus.PROCESSED);
      expect(updated?.processedAt).toBeInstanceOf(Date);
    });

    it('should update processedAt timestamp', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      const beforeTimestamp = new Date();
      await repository.markProcessed(result.message.id);
      const afterTimestamp = new Date();

      const updated = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(updated?.processedAt).toBeDefined();
      expect(updated!.processedAt!.getTime()).toBeGreaterThanOrEqual(beforeTimestamp.getTime());
      expect(updated!.processedAt!.getTime()).toBeLessThanOrEqual(afterTimestamp.getTime());
    });
  });

  describe('markFailed', () => {
    it('should mark message as failed with error message', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markFailed(result.message.id, 'Handler threw exception');

      const updated = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(updated?.status).toBe(InboxMessageStatus.FAILED);
      expect(updated?.errorMessage).toBe('Handler threw exception');
    });

    it('should store complete error messages', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      const longError = 'Error: ' + 'A'.repeat(500);

      await repository.markFailed(result.message.id, longError);

      const updated = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(updated?.errorMessage).toBe(longError);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old processed messages', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markProcessed(result.message.id);

      // Manually set receivedAt to be old
      await dataSource.getRepository(InboxMessageEntity).update(result.message.id, {
        receivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(1);

      const messages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(messages).toHaveLength(0);
    });

    it('should not delete recent processed messages', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markProcessed(result.message.id);

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(0);

      const messages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });

    it('should not delete unprocessed messages', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      // Manually set receivedAt to be old
      await dataSource.getRepository(InboxMessageEntity).update(result.message.id, {
        receivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(0);

      const messages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });

    it('should not delete failed messages', async () => {
      const result = await repository.record({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
      });

      await repository.markFailed(result.message.id, 'Error');

      // Manually set receivedAt to be old
      await dataSource.getRepository(InboxMessageEntity).update(result.message.id, {
        receivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      );

      expect(deletedCount).toBe(0);

      const messages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(messages).toHaveLength(1);
    });

    it('should delete multiple old processed messages', async () => {
      // Create and process 3 messages
      for (let i = 0; i < 3; i++) {
        const result = await repository.record({
          messageId: `msg-${i}`,
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
        });

        await repository.markProcessed(result.message.id);

        // Set old receivedAt
        await dataSource.getRepository(InboxMessageEntity).update(result.message.id, {
          receivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        });
      }

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      );

      expect(deletedCount).toBe(3);

      const messages = await dataSource.getRepository(InboxMessageEntity).find();
      expect(messages).toHaveLength(0);
    });
  });

  describe('workflow integration', () => {
    it('should handle complete message lifecycle', async () => {
      // 1. Record message
      const result = await repository.record({
        messageId: 'msg-lifecycle',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.message.status).toBe(InboxMessageStatus.RECEIVED);

      // 2. Mark as processing
      await repository.markProcessing(result.message.id);

      let message = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });
      expect(message?.status).toBe(InboxMessageStatus.PROCESSING);

      // 3. Mark as processed
      await repository.markProcessed(result.message.id);

      message = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });
      expect(message?.status).toBe(InboxMessageStatus.PROCESSED);
      expect(message?.processedAt).toBeInstanceOf(Date);

      // 4. Clean up old messages
      await dataSource.getRepository(InboxMessageEntity).update(result.message.id, {
        receivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      });

      const deletedCount = await repository.deleteOlderThan(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      );

      expect(deletedCount).toBe(1);
    });

    it('should handle failed message lifecycle', async () => {
      // 1. Record message
      const result = await repository.record({
        messageId: 'msg-failed',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      });

      // 2. Mark as processing
      await repository.markProcessing(result.message.id);

      // 3. Mark as failed
      await repository.markFailed(result.message.id, 'Handler exception');

      const message = await dataSource
        .getRepository(InboxMessageEntity)
        .findOne({ where: { id: result.message.id } });

      expect(message?.status).toBe(InboxMessageStatus.FAILED);
      expect(message?.errorMessage).toBe('Handler exception');
      expect(message?.processedAt).toBeNull();
    });
  });
});
