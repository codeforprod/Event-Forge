import { OutboxMessage, OutboxMessageStatus } from '@prodforcode/event-forge-core';

import { GolevelupPublisher } from '../golevelup-publisher';
import { AmqpConnection } from '../types';

describe('GolevelupPublisher', () => {
  let publisher: GolevelupPublisher;
  let mockAmqpConnection: jest.Mocked<AmqpConnection>;

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn(),
    } as jest.Mocked<AmqpConnection>;

    publisher = new GolevelupPublisher(mockAmqpConnection, 'events.topic');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

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

  describe('publish - basic message', () => {
    it('should publish message to exchange with correct routing key', async () => {
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      expect(mockAmqpConnection.publish).toHaveBeenCalledTimes(1);
      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.topic',
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
    });

    it('should include metadata in message body', async () => {
      const message = createMockMessage({
        metadata: { correlationId: 'corr-123', userId: 'u-1' },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const body = callArgs[2] as Record<string, unknown>;
      expect(body.metadata).toEqual({ correlationId: 'corr-123', userId: 'u-1' });
    });
  });

  describe('traceparent header (W3C distributed tracing)', () => {
    it('should add traceparent header when traceId and spanId are present', async () => {
      const message = createMockMessage({
        metadata: {
          traceId: 'abcdef1234567890abcdef1234567890',
          spanId: '1234567890abcdef',
        },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBe(
        '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01',
      );
    });

    it('should use default spanId when only traceId is present', async () => {
      const message = createMockMessage({
        metadata: {
          traceId: 'abcdef1234567890abcdef1234567890',
        },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBe(
        '00-abcdef1234567890abcdef1234567890-0000000000000000-01',
      );
    });

    it('should not add traceparent when no traceId in metadata', async () => {
      const message = createMockMessage({
        metadata: { correlationId: 'corr-123' },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBeUndefined();
    });

    it('should not add traceparent when metadata is undefined', async () => {
      const message = createMockMessage();

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBeUndefined();
    });

    it('should not add traceparent when traceId is not a string', async () => {
      const message = createMockMessage({
        metadata: { traceId: 12345 as unknown as string },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBeUndefined();
    });

    it('should ignore non-string spanId and use default', async () => {
      const message = createMockMessage({
        metadata: {
          traceId: 'abcdef1234567890abcdef1234567890',
          spanId: 99999 as unknown as string,
        },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers?.traceparent).toBe(
        '00-abcdef1234567890abcdef1234567890-0000000000000000-01',
      );
    });

    it('should merge custom headers with traceparent', async () => {
      const message = createMockMessage({
        metadata: {
          traceId: 'abcdef1234567890abcdef1234567890',
          spanId: '1234567890abcdef',
        },
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message, {
        headers: { 'x-custom': 'value' },
      });

      const callArgs = mockAmqpConnection.publish.mock.calls[0];
      const publishOptions = callArgs[3];
      expect(publishOptions?.headers).toEqual(
        expect.objectContaining({
          'x-custom': 'value',
          'x-aggregate-type': 'User',
          traceparent: '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01',
        }),
      );
    });
  });

  describe('routing key', () => {
    it('should build routing key as aggregateType.eventType', async () => {
      const message = createMockMessage({
        aggregateType: 'Order',
        eventType: 'order.placed',
      });

      mockAmqpConnection.publish.mockResolvedValue(undefined);

      await publisher.publish(message);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        'events.topic',
        'Order.order.placed',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('error handling', () => {
    it('should propagate amqpConnection.publish errors', async () => {
      const message = createMockMessage();

      mockAmqpConnection.publish.mockRejectedValue(new Error('Connection lost'));

      await expect(publisher.publish(message)).rejects.toThrow('Connection lost');
    });
  });
});
