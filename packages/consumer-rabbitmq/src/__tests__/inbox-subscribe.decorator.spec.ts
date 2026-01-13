import { ModuleRef } from '@nestjs/core';
import { IInboxRepository, InboxMessageStatus } from '@prodforcode/event-forge-core';

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

  beforeEach(() => {
    // Create mock inbox repository
    mockInboxRepository = {
      record: jest.fn(),
      exists: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      findRetryable: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    // Create mock module ref
    mockModuleRef = {
      get: jest.fn().mockReturnValue(mockInboxRepository),
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
        get: jest.fn().mockReturnValue(null),
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

    it('should propagate errors from original handler', async () => {
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

      const testError = new Error('Handler failed');
      const originalMethod = jest.fn().mockRejectedValue(testError);
      const descriptor = { value: originalMethod };

      const decorator = InboxSubscribe(options);
      decorator({}, 'handleUserCreated', descriptor);

      const message: RabbitMQMessage = {
        id: 'msg-123',
      };

      await expect(descriptor.value(message)).rejects.toThrow('Handler failed');
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
