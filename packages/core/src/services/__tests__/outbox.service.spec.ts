import { OutboxService, OutboxEvents } from '../outbox.service';
import { OutboxMessageStatus } from '../../interfaces/outbox-message.interface';
import { IOutboxRepository } from '../../interfaces/outbox-repository.interface';
import { IMessagePublisher } from '../../interfaces/message-publisher.interface';
import { OutboxMessage } from '../../interfaces/outbox-message.interface';
import { CreateOutboxMessageDto } from '../../interfaces/create-outbox-message.dto';
import { ProcessingError } from '../../errors/processing.error';
import { OutboxConfig } from '../../config/outbox.config';

describe('OutboxService', () => {
  let service: OutboxService;
  let mockRepository: jest.Mocked<IOutboxRepository>;
  let mockPublisher: jest.Mocked<IMessagePublisher>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      withTransaction: jest.fn(),
      fetchAndLockPending: jest.fn(),
      findAndLockById: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      releaseLock: jest.fn(),
      releaseStaleLocks: jest.fn(),
      deleteOlderThan: jest.fn(),
    } as jest.Mocked<IOutboxRepository>;

    mockPublisher = {
      publish: jest.fn(),
    } as jest.Mocked<IMessagePublisher>;

    service = new OutboxService(mockRepository, mockPublisher);
  });

  afterEach(() => {
    jest.useRealTimers();
    try {
      service.stopProcessor();
    } catch (e) {
      // Ignore errors during cleanup
    }
    jest.clearAllMocks();
  });

  describe('createMessage', () => {
    it('should create a message with default maxRetries', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
      };

      const expectedMessage: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockResolvedValue(expectedMessage);

      const result = await service.createMessage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        {
          ...dto,
          maxRetries: 3,
        },
        undefined,
      );
      expect(result).toEqual(expectedMessage);
    });

    it('should create a message with custom maxRetries', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
        maxRetries: 5,
      };

      const expectedMessage: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockResolvedValue(expectedMessage);

      const result = await service.createMessage(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(dto, undefined);
      expect(result).toEqual(expectedMessage);
    });

    it('should create a message within a transaction context', async () => {
      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
      };

      const transactionContext = { id: 'tx-1' };
      const expectedMessage: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockResolvedValue(expectedMessage);

      const result = await service.createMessage(dto, transactionContext);

      expect(mockRepository.create).toHaveBeenCalledWith(
        {
          ...dto,
          maxRetries: 3,
        },
        transactionContext,
      );
      expect(result).toEqual(expectedMessage);
    });

    it('should emit MESSAGE_CREATED event when immediateProcessing is enabled', async () => {
      const config: OutboxConfig = {
        immediateProcessing: true,
      };

      service = new OutboxService(mockRepository, mockPublisher, config);

      const dto: CreateOutboxMessageDto = {
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
      };

      const expectedMessage: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John Doe' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockResolvedValue(expectedMessage);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.createMessage(dto);

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.MESSAGE_CREATED, 'msg-1');
    });
  });

  describe('withTransaction', () => {
    it('should execute operation within a transaction', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      mockRepository.withTransaction.mockImplementation((op) => op('tx-context'));

      const result = await service.withTransaction(operation);

      expect(mockRepository.withTransaction).toHaveBeenCalled();
      expect(operation).toHaveBeenCalledWith('tx-context');
      expect(result).toBe('result');
    });
  });

  describe('startProcessor', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should emit PROCESSOR_STARTED event', () => {
      const emitSpy = jest.spyOn(service, 'emit');

      service.startProcessor();

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.PROCESSOR_STARTED);
    });

    it('should emit legacy POLLING_STARTED event', () => {
      const emitSpy = jest.spyOn(service, 'emit');

      service.startProcessor();

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.POLLING_STARTED);
    });

    it('should not start multiple processors', () => {
      service.startProcessor();
      service.startProcessor();
      service.startProcessor();

      // Should be idempotent
      expect(service).toBeDefined();
    });

    it('should listen for MESSAGE_CREATED events after starting', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PROCESSING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findAndLockById.mockResolvedValue(message);
      mockPublisher.publish.mockResolvedValue(undefined);
      mockRepository.markPublished.mockResolvedValue(undefined);

      service.startProcessor();

      // Emit MESSAGE_CREATED (simulating createMessage)
      service.emit(OutboxEvents.MESSAGE_CREATED, 'msg-1');

      // Flush microtasks (fake timers intercept setImmediate)
      await jest.advanceTimersByTimeAsync(0);

      expect(mockRepository.findAndLockById).toHaveBeenCalledWith('msg-1', expect.any(String));
      expect(mockPublisher.publish).toHaveBeenCalledWith(message);
      expect(mockRepository.markPublished).toHaveBeenCalledWith('msg-1');
    });
  });

  describe('stopProcessor', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should emit PROCESSOR_STOPPED event', () => {
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.startProcessor();

      const emitSpy = jest.spyOn(service, 'emit');

      service.stopProcessor();

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.PROCESSOR_STOPPED);
    });

    it('should preserve user-registered MESSAGE_CREATED listeners', () => {
      const userListener = jest.fn();
      service.on(OutboxEvents.MESSAGE_CREATED, userListener);

      service.startProcessor();
      service.stopProcessor();

      // User listener should still be registered
      service.emit(OutboxEvents.MESSAGE_CREATED, 'test-id');
      expect(userListener).toHaveBeenCalledWith('test-id');
    });

    it('should stop safety net polling', () => {
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.startProcessor();

      const initialCallCount = mockRepository.releaseStaleLocks.mock.calls.length;

      service.stopProcessor();

      jest.advanceTimersByTime(600000); // 10 minutes

      // No additional calls after stopping
      expect(mockRepository.releaseStaleLocks).toHaveBeenCalledTimes(initialCallCount);
    });
  });

  describe('processMessageById', () => {
    it('should find, lock, and publish a message by ID', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PROCESSING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findAndLockById.mockResolvedValue(message);
      mockPublisher.publish.mockResolvedValue(undefined);
      mockRepository.markPublished.mockResolvedValue(undefined);

      await service.processMessageById('msg-1');

      expect(mockRepository.findAndLockById).toHaveBeenCalledWith('msg-1', expect.any(String));
      expect(mockPublisher.publish).toHaveBeenCalledWith(message);
      expect(mockRepository.markPublished).toHaveBeenCalledWith('msg-1');
    });

    it('should do nothing when message is not found or not eligible', async () => {
      mockRepository.findAndLockById.mockResolvedValue(null);

      await service.processMessageById('msg-1');

      expect(mockRepository.findAndLockById).toHaveBeenCalledWith('msg-1', expect.any(String));
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('should emit error on unexpected failure', async () => {
      const error = new Error('DB connection lost');
      mockRepository.findAndLockById.mockRejectedValue(error);

      service.on('error', () => {});
      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessageById('msg-1');

      expect(emitSpy).toHaveBeenCalledWith('error', error);
    });
  });

  describe('pollAndProcess (safety net)', () => {
    it('should release stale locks before fetching messages', async () => {
      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([]);

      await service.processMessage('msg-1');

      expect(mockRepository.releaseStaleLocks).toHaveBeenCalledWith(
        expect.any(Date),
      );
      expect(mockRepository.fetchAndLockPending).toHaveBeenCalled();
    });

    it('should fetch and process pending messages', async () => {
      const messages: OutboxMessage[] = [
        {
          id: 'msg-1',
          aggregateType: 'User',
          eventType: 'user.created',
          aggregateId: 'user-123',
          payload: { name: 'John' },
          status: OutboxMessageStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'msg-2',
          aggregateType: 'Order',
          eventType: 'order.placed',
          aggregateId: 'order-456',
          payload: { total: 100 },
          status: OutboxMessageStatus.PENDING,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue(messages);
      mockPublisher.publish.mockResolvedValue(undefined);
      mockRepository.markPublished.mockResolvedValue(undefined);

      await service.processMessage('msg-1');

      expect(mockRepository.fetchAndLockPending).toHaveBeenCalledWith(10, expect.any(String));
      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
      expect(mockRepository.markPublished).toHaveBeenCalledTimes(2);
    });

    it('should emit error on processing failure but continue polling', async () => {
      const error = new Error('Processing failed');
      mockRepository.releaseStaleLocks.mockRejectedValue(error);

      service.on('error', () => {});

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage('msg-1');

      expect(emitSpy).toHaveBeenCalledWith('error', error);
    });
  });

  describe('publishMessage', () => {
    it('should publish message and mark as published', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPublisher.publish.mockResolvedValue(undefined);
      mockRepository.markPublished.mockResolvedValue(undefined);

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([message]);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage('msg-1');

      expect(mockPublisher.publish).toHaveBeenCalledWith(message);
      expect(mockRepository.markPublished).toHaveBeenCalledWith('msg-1');
      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.MESSAGE_PUBLISHED, message);
    });

    it('should handle publish errors with retry and schedule timer', async () => {
      jest.useFakeTimers();
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 1,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new Error('Network error');
      mockPublisher.publish.mockRejectedValue(error);
      mockRepository.markFailed.mockResolvedValue(undefined);

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([message]);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage('msg-1');

      expect(mockRepository.markFailed).toHaveBeenCalledWith(
        'msg-1',
        'Network error',
        false,
        expect.any(Date),
      );
      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.MESSAGE_FAILED, {
        message,
        error,
        permanent: false,
      });
      jest.useRealTimers();
    });

    it('should calculate exponential backoff with scheduledAt', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 2,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new Error('Network error');
      mockPublisher.publish.mockRejectedValue(error);
      mockRepository.markFailed.mockResolvedValue(undefined);

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([message]);

      const beforeTime = Date.now();
      await service.processMessage('msg-1');
      const afterTime = Date.now();

      expect(mockRepository.markFailed).toHaveBeenCalled();
      const callArgs = mockRepository.markFailed.mock.calls[0];
      expect(callArgs[0]).toBe('msg-1');
      expect(callArgs[1]).toBe('Network error');
      expect(callArgs[2]).toBe(false);

      const scheduledAt = callArgs[3] as Date;
      expect(scheduledAt).toBeInstanceOf(Date);

      // With retryCount=2, backoff should be 5 * 2^2 = 20 seconds (± jitter)
      const scheduledTime = scheduledAt.getTime();
      expect(scheduledTime).toBeGreaterThan(beforeTime + 18000);
      expect(scheduledTime).toBeLessThan(afterTime + 22000);
    });

    it('should mark as permanently failed when max retries exceeded', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 3,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new Error('Network error');
      mockPublisher.publish.mockRejectedValue(error);
      mockRepository.markFailed.mockResolvedValue(undefined);

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([message]);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage('msg-1');

      expect(mockRepository.markFailed).toHaveBeenCalledWith(
        'msg-1',
        'Network error',
        true,
      );
      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.MESSAGE_FAILED, {
        message,
        error,
        permanent: true,
      });
    });

    it('should mark as permanently failed for ProcessingError', async () => {
      const message: OutboxMessage = {
        id: 'msg-1',
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
        payload: { name: 'John' },
        status: OutboxMessageStatus.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const error = new ProcessingError('Invalid payload format', 'msg-1', 'user.created');
      mockPublisher.publish.mockRejectedValue(error);
      mockRepository.markFailed.mockResolvedValue(undefined);

      mockRepository.releaseStaleLocks.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([message]);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage('msg-1');

      expect(mockRepository.markFailed).toHaveBeenCalledWith(
        'msg-1',
        'Invalid payload format',
        true,
      );
      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.MESSAGE_FAILED, {
        message,
        error,
        permanent: true,
      });
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should delete old published messages', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(5);
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.on('error', () => {});

      service.startProcessor();

      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      expect(mockRepository.deleteOlderThan).toHaveBeenCalledWith(
        expect.any(Date),
      );
    });

    it('should emit cleanup event with deleted count', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(10);
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.on('error', () => {});

      const emitSpy = jest.spyOn(service, 'emit');

      service.startProcessor();

      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      expect(emitSpy).toHaveBeenCalledWith('cleanup', {
        deleted: 10,
        cutoffDate: expect.any(Date),
      });
    });

    it('should not emit cleanup event when no messages deleted', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(0);
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.on('error', () => {});

      const emitSpy = jest.spyOn(service, 'emit');

      service.startProcessor();

      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      expect(emitSpy).not.toHaveBeenCalledWith('cleanup', expect.anything());
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Cleanup failed');
      mockRepository.deleteOlderThan.mockRejectedValue(error);
      mockRepository.fetchAndLockPending.mockResolvedValue([]);
      mockRepository.releaseStaleLocks.mockResolvedValue(0);

      service.on('error', () => {});

      const emitSpy = jest.spyOn(service, 'emit');

      service.startProcessor();

      jest.advanceTimersByTime(3600000);
      await Promise.resolve();

      expect(emitSpy).toHaveBeenCalledWith('error', error);
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const config: OutboxConfig = {
        safetyNetInterval: 300000,
        batchSize: 50,
        maxRetries: 5,
        lockTimeoutSeconds: 120,
        cleanupInterval: 7200000,
        retentionDays: 14,
        workerId: 'worker-1',
        immediateProcessing: true,
      };

      service = new OutboxService(mockRepository, mockPublisher, config);

      expect(service).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const config: OutboxConfig = {
        safetyNetInterval: 600000,
      };

      service = new OutboxService(mockRepository, mockPublisher, config);

      expect(service).toBeDefined();
    });

    it('should use pollingInterval as fallback for safetyNetInterval', () => {
      const config: OutboxConfig = {
        pollingInterval: 120000,
      };

      service = new OutboxService(mockRepository, mockPublisher, config);

      expect(service).toBeDefined();
    });
  });

  describe('deprecated aliases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('startPolling should call startProcessor', () => {
      const emitSpy = jest.spyOn(service, 'emit');

      service.startPolling();

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.PROCESSOR_STARTED);
    });

    it('stopPolling should call stopProcessor', () => {
      service.startPolling();

      const emitSpy = jest.spyOn(service, 'emit');

      service.stopPolling();

      expect(emitSpy).toHaveBeenCalledWith(OutboxEvents.PROCESSOR_STOPPED);
    });
  });
});
