import { ModuleRef } from '@nestjs/core';
import { IInboxRepository, InboxMessageStatus, InboxService } from '@prodforcode/event-forge-core';
import { INBOX_SERVICE } from '@prodforcode/event-forge-nestjs';

import {
  InboxSubscribe,
  setModuleRef,
} from '../decorators/inbox-subscribe.decorator';
import { RabbitMQMessage } from '../interfaces/rabbitmq-message.interface';

jest.mock('@golevelup/nestjs-rabbitmq', () => ({
  RabbitSubscribe: jest.fn(() => jest.fn()),
}));

describe('InboxSubscribe Decorator', () => {
  let mockModuleRef: jest.Mocked<ModuleRef>;
  let mockInboxRepository: jest.Mocked<IInboxRepository>;
  let mockInboxService: jest.Mocked<Partial<InboxService>>;

  beforeEach(() => {
    // Create mock inbox repository
    mockInboxRepository = {
      record: jest.fn(),
      exists: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    // Create mock inbox service
    mockInboxService = {
      emit: jest.fn(),
    };

    // Create mock module ref that returns different values based on token
    mockModuleRef = {
      get: jest.fn().mockImplementation((token: string | symbol) => {
        if (token === 'IInboxRepository') {
          return mockInboxRepository;
        }
        if (token === INBOX_SERVICE) {
          return mockInboxService;
        }
        return null;
      }),
    } as unknown as jest.Mocked<ModuleRef>;

    // Initialize decorator with module ref
    setModuleRef(mockModuleRef);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('method wrapping', () => {
    it('should wrap the original method with inbox recording logic', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      const originalMethod = jest.fn().mockResolvedValue('result');
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      // Verify that descriptor.value has been replaced with wrapped handler
      expect(descriptor.value).not.toBe(originalMethod);
      expect(descriptor.value.name).toBe('wrappedInboxHandler');
    });

    it('should record message in inbox before calling original handler', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const originalMethod = jest.fn().mockResolvedValue('result');
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
        properties: {
          type: 'user.created',
        },
      };

      const result = await descriptor.value(message);

      // Verify inbox recording was called
      expect(mockInboxRepository.record).toHaveBeenCalledWith({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: message,
      });

      // Verify original handler was called
      expect(originalMethod).toHaveBeenCalledWith(message);
      expect(result).toBe('result');
    });

    it('should skip handler execution for duplicate messages', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: true,
      });

      const originalMethod = jest.fn().mockResolvedValue('result');
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
        properties: {
          type: 'user.created',
        },
      };

      const result = await descriptor.value(message);

      // Verify inbox recording was called
      expect(mockInboxRepository.record).toHaveBeenCalled();

      // Verify original handler was NOT called for duplicate
      expect(originalMethod).not.toHaveBeenCalled();

      // Verify result is undefined (early return)
      expect(result).toBeUndefined();
    });

    it('should extract messageId from EventForge format (message.id)', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'evt-forge-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const originalMethod = jest.fn();
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'evt-forge-123', // EventForge format
        properties: {
          messageId: 'amqp-456', // Should be ignored (lower priority)
        },
      };

      await descriptor.value(message);

      expect(mockInboxRepository.record).toHaveBeenCalledWith({
        messageId: 'evt-forge-123', // Priority 2: message.id
        source: 'user-service',
        eventType: 'user.created',
        payload: message,
      });
    });

    it('should extract messageId from AMQP properties.messageId as fallback', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'amqp-456',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const originalMethod = jest.fn();
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        properties: {
          messageId: 'amqp-456', // Priority 3: AMQP format
        },
      };

      await descriptor.value(message);

      expect(mockInboxRepository.record).toHaveBeenCalledWith({
        messageId: 'amqp-456', // Priority 3: properties.messageId
        source: 'user-service',
        eventType: 'user.created',
        payload: message,
      });
    });

    it('should use custom messageIdExtractor when provided', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        messageIdExtractor: (msg: RabbitMQMessage) => {
          const custom = msg as { customId?: string };
          return custom.customId || 'default';
        },
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'custom-789',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const originalMethod = jest.fn();
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        customId: 'custom-789',
        properties: {
          messageId: 'should-be-ignored',
        },
      };

      await descriptor.value(message);

      expect(mockInboxRepository.record).toHaveBeenCalledWith({
        messageId: 'custom-789', // Priority 1: custom extractor
        source: 'user-service',
        eventType: 'user.created',
        payload: message,
      });
    });

    it('should throw error if moduleRef is not initialized', async () => {
      // Reset module ref to simulate uninitialized state
      setModuleRef(null as unknown as ModuleRef);

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      const originalMethod = jest.fn();
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await expect(descriptor.value(message)).rejects.toThrow(
        'InboxConsumerModule not initialized',
      );

      // Restore module ref for other tests
      setModuleRef(mockModuleRef);
    });

    it('should throw error if IInboxRepository is not found', async () => {
      const mockModuleRefNoRepo = {
        get: jest.fn().mockImplementation((token: string | symbol) => {
          if (token === INBOX_SERVICE) {
            return mockInboxService;
          }
          return null; // IInboxRepository returns null
        }),
      } as unknown as jest.Mocked<ModuleRef>;

      setModuleRef(mockModuleRefNoRepo);

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      const originalMethod = jest.fn();
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await expect(descriptor.value(message)).rejects.toThrow(
        'IInboxRepository not found',
      );

      // Restore module ref for other tests
      setModuleRef(mockModuleRef);
    });
  });

  describe('error handling and inline retry', () => {
    it('should mark message as processed on successful handler execution', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const originalMethod = jest.fn().mockResolvedValue('result');
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await descriptor.value(message);

      // Verify message was marked as processing then processed
      expect(mockInboxRepository.markProcessing).toHaveBeenCalledWith('inbox-1');
      expect(mockInboxRepository.markProcessed).toHaveBeenCalledWith('inbox-1');
    });

    it('should not throw on handler error — returns to ACK the message', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 0, // No retries — immediate permanent fail
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 0,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      // Should NOT throw — inline retry handles everything
      const result = await descriptor.value(message);
      expect(result).toBeUndefined();
    });

    it('should mark message as permanently failed when maxRetries exceeded', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 0, // No retries — attempt 0 >= maxRetries 0
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 0,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await descriptor.value(message);

      // Verify message was marked as permanently failed
      expect(mockInboxRepository.markFailed).toHaveBeenCalledWith(
        'inbox-1',
        'Handler failed',
        true, // permanent
      );
    });

    it('should mark message as permanently failed for ProcessingError', async () => {
      const { ProcessingError } = require('@prodforcode/event-forge-core');

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 3,
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const permanentError = new ProcessingError('Invalid payload', 'msg-123', 'user.created');
      const originalMethod = jest.fn().mockRejectedValue(permanentError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      // Should NOT throw — decorator returns (ACK)
      await descriptor.value(message);

      // Should immediately mark as permanent (no retries for ProcessingError)
      expect(mockInboxRepository.markFailed).toHaveBeenCalledWith(
        'inbox-1',
        'Invalid payload',
        true, // permanent
      );

      // Handler called only once — no retry for ProcessingError
      expect(originalMethod).toHaveBeenCalledTimes(1);
    });

    it('should emit MESSAGE_FAILED event with permanent=true when max retries exceeded', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 0,
      };

      const recordedMessage = {
        id: 'inbox-1',
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 0,
        createdAt: new Date(),
      };

      mockInboxRepository.record.mockResolvedValue({
        message: recordedMessage,
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await descriptor.value(message);

      // Verify MESSAGE_FAILED event was emitted with permanent=true
      expect(mockInboxService.emit).toHaveBeenCalledWith(
        'inbox:message:failed',
        expect.objectContaining({
          message: recordedMessage,
          error: 'Handler failed',
          permanent: true,
        }),
      );
    });

    it('should retry with inline backoff on transient errors', async () => {
      jest.useFakeTimers();

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 2,
        backoffBaseSeconds: 1,
        maxBackoffSeconds: 10,
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 2,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      // Fail first 2 attempts, succeed on 3rd
      const originalMethod = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');

      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      // Start the handler
      const resultPromise = descriptor.value(message);

      // Advance past first backoff (attempt 0 fail: base * 2^0 = 1s ± jitter)
      await jest.advanceTimersByTimeAsync(2000);

      // Advance past second backoff (attempt 1 fail: base * 2^1 = 2s ± jitter)
      await jest.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      // Handler called 3 times (attempt 0, 1, 2)
      expect(originalMethod).toHaveBeenCalledTimes(3);

      // First two attempts marked as failed (non-permanent)
      expect(mockInboxRepository.markFailed).toHaveBeenCalledTimes(2);
      expect(mockInboxRepository.markFailed).toHaveBeenNthCalledWith(
        1, 'inbox-1', 'Fail 1', false,
      );
      expect(mockInboxRepository.markFailed).toHaveBeenNthCalledWith(
        2, 'inbox-1', 'Fail 2', false,
      );

      // Final attempt succeeded
      expect(mockInboxRepository.markProcessed).toHaveBeenCalledWith('inbox-1');
      expect(result).toBe('success');

      jest.useRealTimers();
    });

    it('should emit MESSAGE_FAILED with permanent=false during inline retry', async () => {
      jest.useFakeTimers();

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 1,
        backoffBaseSeconds: 1,
        maxBackoffSeconds: 10,
      };

      const recordedMessage = {
        id: 'inbox-1',
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: {},
        status: InboxMessageStatus.RECEIVED,
        retryCount: 0,
        maxRetries: 1,
        createdAt: new Date(),
      };

      mockInboxRepository.record.mockResolvedValue({
        message: recordedMessage,
        isDuplicate: false,
      });

      const testError = new Error('Transient error');
      const originalMethod = jest.fn()
        .mockRejectedValueOnce(testError)
        .mockRejectedValueOnce(new Error('Still failing'));
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      const resultPromise = descriptor.value(message);

      // Advance past backoff
      await jest.advanceTimersByTimeAsync(2000);

      await resultPromise;

      // First attempt: non-permanent failure
      expect(mockInboxService.emit).toHaveBeenCalledWith(
        'inbox:message:failed',
        expect.objectContaining({
          message: recordedMessage,
          error: 'Transient error',
          permanent: false,
        }),
      );

      // Second attempt (attempt 1 >= maxRetries 1): permanent failure
      expect(mockInboxService.emit).toHaveBeenCalledWith(
        'inbox:message:failed',
        expect.objectContaining({
          message: recordedMessage,
          error: 'Still failing',
          permanent: true,
        }),
      );

      jest.useRealTimers();
    });

    it('should use custom maxRetries from decorator options', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 0, // Override message default of 3
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3, // Message default, overridden by decorator options
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await descriptor.value(message);

      // With maxRetries=0 from options, handler is called once then permanently fails
      expect(originalMethod).toHaveBeenCalledTimes(1);
      expect(mockInboxRepository.markFailed).toHaveBeenCalledWith(
        'inbox-1',
        'Handler failed',
        true, // permanent because maxRetries=0
      );
    });

    it('should handle error when InboxService is not available (graceful fallback)', async () => {
      // Create module ref without InboxService
      const mockModuleRefNoInboxService = {
        get: jest.fn().mockImplementation((token: string | symbol) => {
          if (token === 'IInboxRepository') {
            return mockInboxRepository;
          }
          if (token === INBOX_SERVICE) {
            return null; // InboxService not available
          }
          return null;
        }),
      } as unknown as jest.Mocked<ModuleRef>;

      setModuleRef(mockModuleRefNoInboxService);

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        maxRetries: 0,
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 0,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      // Should still work without throwing, just without event emission
      await descriptor.value(message);

      // Repository should still be called
      expect(mockInboxRepository.markFailed).toHaveBeenCalledWith(
        'inbox-1',
        'Handler failed',
        true,
      );

      // Restore module ref for other tests
      setModuleRef(mockModuleRef);
    });

    it('should not retry when enableRetry is false', async () => {
      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
        enableRetry: false, // Disable retry
        maxRetries: 3,
      };

      mockInboxRepository.record.mockResolvedValue({
        message: {
          id: 'inbox-1',
          messageId: 'msg-123',
          source: 'user-service',
          eventType: 'user.created',
          payload: {},
          status: InboxMessageStatus.RECEIVED,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
        },
        isDuplicate: false,
      });

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await descriptor.value(message);

      // Handler called only once — no retry when enableRetry is false
      expect(originalMethod).toHaveBeenCalledTimes(1);

      // Marked as permanently failed immediately
      expect(mockInboxRepository.markFailed).toHaveBeenCalledWith(
        'inbox-1',
        'Handler failed',
        true, // permanent when enableRetry is false
      );
    });
  });

  describe('RabbitSubscribe integration', () => {
    it('should apply RabbitSubscribe with correct options', () => {
      const { RabbitSubscribe } = require('@golevelup/nestjs-rabbitmq');
      const rabbitSubscribeMock = jest.fn(() => jest.fn());
      RabbitSubscribe.mockImplementation(rabbitSubscribeMock);

      const options = {
        exchange: 'events',
        routingKey: 'user.created',
        queue: 'user-queue',
        queueOptions: { durable: true },
        source: 'user-service',
      };

      const decorator = InboxSubscribe(options);
      const target = {};
      const propertyKey = 'handleUserCreated';
      const descriptor = { value: jest.fn() };

      decorator(target, propertyKey, descriptor);

      expect(rabbitSubscribeMock).toHaveBeenCalledWith({
        exchange: 'events',
        routingKey: 'user.created',
        queue: 'user-queue',
        queueOptions: { durable: true },
      });
    });
  });
});
