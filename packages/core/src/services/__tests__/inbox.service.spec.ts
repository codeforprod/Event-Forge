import { InboxService, InboxEvents, MessageHandler } from '../inbox.service';
import { IInboxRepository } from '../../interfaces/inbox-repository.interface';
import { InboxMessage, InboxMessageStatus } from '../../interfaces/inbox-message.interface';
import { CreateInboxMessageDto } from '../../interfaces/create-inbox-message.dto';
import { DuplicateMessageError } from '../../errors/duplicate-message.error';
import { ProcessingError } from '../../errors/processing.error';
import { InboxConfig } from '../../config/inbox.config';

describe('InboxService', () => {
  let service: InboxService;
  let mockRepository: jest.Mocked<IInboxRepository>;

  beforeEach(() => {
    mockRepository = {
      record: jest.fn(),
      exists: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      findRetryable: jest.fn(),
      deleteOlderThan: jest.fn(),
    } as jest.Mocked<IInboxRepository>;

    service = new InboxService(mockRepository);
  });

  afterEach(() => {
    service.stopCleanup();
    jest.clearAllMocks();
  });

  describe('registerHandler', () => {
    it('should register a handler for an event type', () => {
      const handler: MessageHandler = jest.fn();

      service.registerHandler('user.created', handler);

      expect(service).toBeDefined();
    });

    it('should register multiple handlers for the same event type', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      expect(service).toBeDefined();
    });

    it('should register handlers for different event types', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      service.registerHandler('user.created', handler1);
      service.registerHandler('order.placed', handler2);

      expect(service).toBeDefined();
    });
  });

  describe('unregisterHandler', () => {
    it('should unregister a specific handler', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      service.unregisterHandler('user.created', handler1);

      expect(service).toBeDefined();
    });

    it('should handle unregistering non-existent handler', () => {
      const handler: MessageHandler = jest.fn();

      service.unregisterHandler('user.created', handler);

      expect(service).toBeDefined();
    });

    it('should handle unregistering from non-existent event type', () => {
      const handler: MessageHandler = jest.fn();

      service.unregisterHandler('non.existent', handler);

      expect(service).toBeDefined();
    });

    it('should remove event type when last handler is unregistered', () => {
      const handler: MessageHandler = jest.fn();

      service.registerHandler('user.created', handler);
      service.unregisterHandler('user.created', handler);

      expect(service).toBeDefined();
    });
  });

  describe('receiveMessage', () => {
    it('should record and process a new message', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.record.mockResolvedValue({
        message,
        isDuplicate: false,
      });
      mockRepository.markProcessed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.receiveMessage(dto);

      expect(mockRepository.record).toHaveBeenCalledWith(dto);
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_RECEIVED, message);
      expect(mockRepository.markProcessed).toHaveBeenCalledWith('inbox-1');
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_PROCESSED, message);
    });

    it('should throw DuplicateMessageError for duplicate messages', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.PROCESSED,
        retryCount: 0,
        maxRetries: 3,
        processedAt: new Date(),
        createdAt: new Date(),
      };

      mockRepository.record.mockResolvedValue({
        message,
        isDuplicate: true,
      });

      const emitSpy = jest.spyOn(service, 'emit');

      await expect(service.receiveMessage(dto)).rejects.toThrow(DuplicateMessageError);
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_DUPLICATE, message);
    });

    it('should emit MESSAGE_RECEIVED event', async () => {
      const dto: CreateInboxMessageDto = {
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
      };

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.record.mockResolvedValue({
        message,
        isDuplicate: false,
      });
      mockRepository.markProcessed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.receiveMessage(dto);

      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_RECEIVED, message);
    });
  });

  describe('processMessage', () => {
    it('should process message with registered handlers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markProcessed.mockResolvedValue(undefined);

      await service.processMessage(message);

      expect(mockRepository.markProcessing).toHaveBeenCalledWith('inbox-1');
      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
      expect(mockRepository.markProcessed).toHaveBeenCalledWith('inbox-1');
    });

    it('should mark as processed when no handlers registered', async () => {
      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage(message);

      expect(mockRepository.markProcessed).toHaveBeenCalledWith('inbox-1');
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_PROCESSED, message);
    });

    it('should emit MESSAGE_PROCESSED event', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler('user.created', handler);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markProcessed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await service.processMessage(message);

      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_PROCESSED, message);
    });

    it('should execute all handlers in parallel', async () => {
      const handler1 = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      const handler2 = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );

      service.registerHandler('user.created', handler1);
      service.registerHandler('user.created', handler2);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markProcessed.mockResolvedValue(undefined);

      const startTime = Date.now();
      await service.processMessage(message);
      const endTime = Date.now();

      // Should take ~100ms, not ~200ms (parallel execution)
      expect(endTime - startTime).toBeLessThan(150);
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle ProcessingError as permanent failure', async () => {
      const error = new ProcessingError('Invalid payload', 'msg-1', 'user.created');
      const handler = jest.fn().mockRejectedValue(error);

      service.registerHandler('user.created', handler);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markFailed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await expect(service.processMessage(message)).rejects.toThrow(ProcessingError);

      expect(mockRepository.markFailed).toHaveBeenCalledWith('inbox-1', 'Invalid payload', true);
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_FAILED, { message, error, permanent: true });
    });

    it('should handle generic errors', async () => {
      const error = new Error('Handler failed');
      const handler = jest.fn().mockRejectedValue(error);

      service.registerHandler('user.created', handler);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markFailed.mockResolvedValue(undefined);

      const emitSpy = jest.spyOn(service, 'emit');

      await expect(service.processMessage(message)).rejects.toThrow(
        'Failed to process inbox message inbox-1: Handler failed',
      );

      expect(mockRepository.markFailed).toHaveBeenCalledWith('inbox-1', 'Handler failed', false, undefined);
      expect(emitSpy).toHaveBeenCalledWith(InboxEvents.MESSAGE_FAILED, { message, error, permanent: false });
    });

    it('should handle non-Error exceptions', async () => {
      const handler = jest.fn().mockRejectedValue('String error');

      service.registerHandler('user.created', handler);

      const message: InboxMessage = {
        id: 'inbox-1',
        messageId: 'msg-1',
        source: 'user-service',
        eventType: 'user.created',
        payload: { name: 'John Doe' },
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date(),
      };

      mockRepository.markProcessing.mockResolvedValue(undefined);
      mockRepository.markFailed.mockResolvedValue(undefined);

      await expect(service.processMessage(message)).rejects.toThrow();

      expect(mockRepository.markFailed).toHaveBeenCalledWith('inbox-1', 'String error', false, undefined);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start cleanup timer', () => {
      mockRepository.deleteOlderThan.mockResolvedValue(0);

      service.startCleanup();

      expect(service).toBeDefined();
    });

    it('should not start multiple cleanup timers', () => {
      mockRepository.deleteOlderThan.mockResolvedValue(0);

      service.startCleanup();
      service.startCleanup();
      service.startCleanup();

      expect(service).toBeDefined();
    });

    it('should delete old processed messages', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(5);

      service.startCleanup();

      // Wait for initial cleanup
      jest.advanceTimersByTime(3600000); // Advance by 1 hour
      await Promise.resolve(); // Let async operations complete

      expect(mockRepository.deleteOlderThan).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should emit cleanup event with deleted count', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(10);

      const emitSpy = jest.spyOn(service, 'emit');

      service.startCleanup();

      // Wait for initial cleanup
      jest.advanceTimersByTime(3600000); // Advance by 1 hour
      await Promise.resolve(); // Let async operations complete

      expect(emitSpy).toHaveBeenCalledWith('cleanup', {
        deleted: 10,
        cutoffDate: expect.any(Date),
      });
    });

    it('should not emit cleanup event when no messages deleted', async () => {
      mockRepository.deleteOlderThan.mockResolvedValue(0);

      const emitSpy = jest.spyOn(service, 'emit');

      service.startCleanup();

      // Wait for initial cleanup
      jest.advanceTimersByTime(3600000); // Advance by 1 hour
      await Promise.resolve(); // Let async operations complete

      expect(emitSpy).not.toHaveBeenCalledWith('cleanup', expect.anything());
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Cleanup failed');
      mockRepository.deleteOlderThan.mockRejectedValue(error);

      // Add error listener to prevent unhandled errors
      service.on('error', () => {});

      const emitSpy = jest.spyOn(service, 'emit');

      service.startCleanup();

      // Wait for initial cleanup
      jest.advanceTimersByTime(3600000); // Advance by 1 hour
      await Promise.resolve(); // Let async operations complete

      expect(emitSpy).toHaveBeenCalledWith('error', error);
    });

    it('should stop cleanup timer', () => {
      mockRepository.deleteOlderThan.mockResolvedValue(0);

      service.startCleanup();

      const initialCallCount = mockRepository.deleteOlderThan.mock.calls.length;

      service.stopCleanup();

      jest.advanceTimersByTime(10000);

      // No additional calls after stopping
      expect(mockRepository.deleteOlderThan).toHaveBeenCalledTimes(initialCallCount);
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const config: InboxConfig = {
        cleanupInterval: 7200000,
        retentionDays: 14,
      };

      service = new InboxService(mockRepository, config);

      expect(service).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const config: InboxConfig = {
        retentionDays: 14,
      };

      service = new InboxService(mockRepository, config);

      expect(service).toBeDefined();
    });
  });
});
