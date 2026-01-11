import { OutboxMessage, OutboxMessageStatus } from '@prodforcode/event-forge-core';

import { DelayedMessagePublisher, DelayedPublisherConfig } from '../delayed-publisher';
import { AmqpConnection } from '../types';

describe('DelayedMessagePublisher', () => {
  let publisher: DelayedMessagePublisher;
  let mockAmqpConnection: jest.Mocked<AmqpConnection>;
  let config: DelayedPublisherConfig;

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn(),
    } as jest.Mocked<AmqpConnection>;

    config = {
      directExchange: 'events.direct',
      delayedExchange: 'events.delayed',
    };

    publisher = new DelayedMessagePublisher(mockAmqpConnection, config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper function to create a mock OutboxMessage
   */
  const createMockMessage = (
    overrides?: Partial<OutboxMessage>,
  ): OutboxMessage => ({
    id: 'msg-123',
    aggregateType: 'User',
    aggregateId: 'user-456',
    eventType: 'user.created',
    payload: { name: 'John Doe', email: 'john@example.com' },
    status: OutboxMessageStatus.PENDING,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  });

  describe('publish - immediate messages (no delay)', () => {
    it('should publish immediate message to directExchange', async () => {
      // Arrange
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledTimes(1);
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        {
          id: 'msg-123',
          aggregateType: 'User',
          aggregateId: 'user-456',
          eventType: 'user.created',
          payload: { name: 'John Doe', email: 'john@example.com' },
          metadata: undefined,
          createdAt: message.createdAt,
        },
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          messageId: 'msg-123',
          timestamp: message.createdAt.getTime(),
          headers: expect.objectContaining({
            'x-aggregate-type': 'User',
            'x-aggregate-id': 'user-456',
            'x-event-type': 'user.created',
          }),
        }),
      );

      // Verify x-delay header is NOT present
      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should publish immediate message when metadata is empty object', async () => {
      // Arrange
      const message = createMockMessage({ metadata: {} });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should publish immediate message when metadata has no delay property', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { correlationId: 'corr-123', source: 'api' },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });
  });

  describe('publish - delayed messages (with metadata.delay)', () => {
    it('should publish delayed message to delayedExchange with x-delay header', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: 5000 }, // 5 seconds delay
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledTimes(1);
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.delayed',
        'User.user.created',
        {
          id: 'msg-123',
          aggregateType: 'User',
          aggregateId: 'user-456',
          eventType: 'user.created',
          payload: { name: 'John Doe', email: 'john@example.com' },
          metadata: { delay: 5000 },
          createdAt: message.createdAt,
        },
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          messageId: 'msg-123',
          timestamp: message.createdAt.getTime(),
          headers: expect.objectContaining({
            'x-aggregate-type': 'User',
            'x-aggregate-id': 'user-456',
            'x-event-type': 'user.created',
            'x-delay': 5000,
          }),
        }),
      );
    });

    it('should publish delayed message with large delay value', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: 3600000 }, // 1 hour delay
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.delayed',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-delay': 3600000,
          }),
        }),
      );
    });

    it('should preserve other metadata fields with delayed message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: {
          delay: 5000,
          correlationId: 'corr-123',
          source: 'api',
          userId: 'user-789',
        },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.delayed',
        'User.user.created',
        expect.objectContaining({
          metadata: {
            delay: 5000,
            correlationId: 'corr-123',
            source: 'api',
            userId: 'user-789',
          },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-delay': 5000,
          }),
        }),
      );
    });
  });

  describe('publish - edge cases with delay values', () => {
    it('should treat zero delay as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: 0 },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat negative delay as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: -5000 },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat string delay value as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: '5000' as unknown as number },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat null delay value as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: null as unknown as number },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat undefined delay value as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: undefined as unknown as number },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat object delay value as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: { value: 5000 } as unknown as number },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat NaN delay value as immediate message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: NaN },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.['x-delay']).toBeUndefined();
    });

    it('should treat Infinity delay value as delayed message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: Infinity },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.delayed',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-delay': Infinity,
          }),
        }),
      );
    });
  });

  describe('routing key format', () => {
    it('should build routing key as aggregateType.eventType', async () => {
      // Arrange
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle complex aggregateType and eventType', async () => {
      // Arrange
      const message = createMockMessage({
        aggregateType: 'CustomerAccount',
        eventType: 'account.subscription.renewed',
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'CustomerAccount.account.subscription.renewed',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle single-word eventType', async () => {
      // Arrange
      const message = createMockMessage({
        aggregateType: 'Order',
        eventType: 'placed',
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'Order.placed',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('publish options handling', () => {
    it('should merge custom headers with default headers', async () => {
      // Arrange
      const message = createMockMessage();
      const customOptions = {
        headers: {
          'x-custom-header': 'custom-value',
          'x-tenant-id': 'tenant-123',
        },
      };

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message, customOptions);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-aggregate-type': 'User',
            'x-aggregate-id': 'user-456',
            'x-event-type': 'user.created',
            'x-custom-header': 'custom-value',
            'x-tenant-id': 'tenant-123',
          }),
        }),
      );
    });

    it('should pass through custom priority and expiration options', async () => {
      // Arrange
      const message = createMockMessage();
      const customOptions = {
        priority: 5,
        expiration: 60000,
      };

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message, customOptions);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          priority: 5,
          expiration: 60000,
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should handle custom headers with delayed message', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: 5000 },
      });
      const customOptions = {
        headers: {
          'x-custom-header': 'custom-value',
        },
      };

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message, customOptions);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.delayed',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-aggregate-type': 'User',
            'x-aggregate-id': 'user-456',
            'x-event-type': 'user.created',
            'x-delay': 5000,
            'x-custom-header': 'custom-value',
          }),
        }),
      );
    });
  });

  describe('message payload structure', () => {
    it('should publish message with all required fields', async () => {
      // Arrange
      const message = createMockMessage({
        payload: { key1: 'value1', nested: { key2: 'value2' } },
        metadata: { correlationId: 'corr-123' },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        {
          id: 'msg-123',
          aggregateType: 'User',
          aggregateId: 'user-456',
          eventType: 'user.created',
          payload: { key1: 'value1', nested: { key2: 'value2' } },
          metadata: { correlationId: 'corr-123' },
          createdAt: message.createdAt,
        },
        expect.anything(),
      );
    });

    it('should set persistent to true by default', async () => {
      // Arrange
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          persistent: true,
        }),
      );
    });

    it('should set contentType to application/json', async () => {
      // Arrange
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          contentType: 'application/json',
        }),
      );
    });

    it('should set messageId to message.id', async () => {
      // Arrange
      const message = createMockMessage({ id: 'unique-msg-id-789' });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          messageId: 'unique-msg-id-789',
        }),
      );
    });

    it('should set timestamp to message.createdAt as milliseconds', async () => {
      // Arrange
      const createdAt = new Date('2024-06-15T14:30:00Z');
      const message = createMockMessage({ createdAt });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(message);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.objectContaining({
          timestamp: createdAt.getTime(),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should propagate amqpConnection.publish errors', async () => {
      // Arrange
      const message = createMockMessage();
      const publishError = new Error('RabbitMQ connection lost');

      mockAmqpConnection.publish.mockRejectedValue(publishError);

      // Act & Assert
      await expect(publisher.publish(message)).rejects.toThrow(
        'RabbitMQ connection lost',
      );
    });

    it('should propagate errors for delayed messages', async () => {
      // Arrange
      const message = createMockMessage({
        metadata: { delay: 5000 },
      });
      const publishError = new Error('Exchange not found');

      mockAmqpConnection.publish.mockRejectedValue(publishError);

      // Act & Assert
      await expect(publisher.publish(message)).rejects.toThrow('Exchange not found');
    });

    it('should handle network timeout errors', async () => {
      // Arrange
      const message = createMockMessage();
      const timeoutError = new Error('Network timeout');

      mockAmqpConnection.publish.mockRejectedValue(timeoutError);

      // Act & Assert
      await expect(publisher.publish(message)).rejects.toThrow('Network timeout');
    });
  });

  describe('configuration', () => {
    it('should use custom exchange names from config', async () => {
      // Arrange
      const customConfig: DelayedPublisherConfig = {
        directExchange: 'custom.direct',
        delayedExchange: 'custom.delayed',
      };
      const customPublisher = new DelayedMessagePublisher(
        mockAmqpConnection,
        customConfig,
      );
      const immediateMessage = createMockMessage();
      const delayedMessage = createMockMessage({ metadata: { delay: 5000 } });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await customPublisher.publish(immediateMessage);
      await customPublisher.publish(delayedMessage);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        1,
        'custom.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        2,
        'custom.delayed',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('multiple message types', () => {
    it('should handle different aggregate types correctly', async () => {
      // Arrange
      const userMessage = createMockMessage({
        aggregateType: 'User',
        eventType: 'user.created',
        aggregateId: 'user-123',
      });

      const orderMessage = createMockMessage({
        aggregateType: 'Order',
        eventType: 'order.placed',
        aggregateId: 'order-456',
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(userMessage);
      await publisher.publish(orderMessage);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledTimes(2);
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        1,
        'events.direct',
        'User.user.created',
        expect.objectContaining({
          aggregateType: 'User',
          aggregateId: 'user-123',
          eventType: 'user.created',
        }),
        expect.anything(),
      );
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        2,
        'events.direct',
        'Order.order.placed',
        expect.objectContaining({
          aggregateType: 'Order',
          aggregateId: 'order-456',
          eventType: 'order.placed',
        }),
        expect.anything(),
      );
    });
  });

  describe('integration scenarios', () => {
    it('should successfully publish a mix of immediate and delayed messages', async () => {
      // Arrange
      const immediateMessage1 = createMockMessage({
        id: 'msg-1',
        eventType: 'user.created',
      });

      const delayedMessage = createMockMessage({
        id: 'msg-2',
        eventType: 'user.welcome.email',
        metadata: { delay: 60000 }, // 1 minute delay
      });

      const immediateMessage2 = createMockMessage({
        id: 'msg-3',
        eventType: 'user.activated',
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      // Act
      await publisher.publish(immediateMessage1);
      await publisher.publish(delayedMessage);
      await publisher.publish(immediateMessage2);

      // Assert
      expect(mockAmqpConnection.publish).toHaveBeenCalledTimes(3);

      // First message: immediate
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        1,
        'events.direct',
        'User.user.created',
        expect.anything(),
        expect.anything(),
      );

      // Second message: delayed
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        2,
        'events.delayed',
        'User.user.welcome.email',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-delay': 60000,
          }),
        }),
      );

      // Third message: immediate
      expect(mockAmqpConnection.publish).toHaveBeenNthCalledWith(
        3,
        'events.direct',
        'User.user.activated',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
