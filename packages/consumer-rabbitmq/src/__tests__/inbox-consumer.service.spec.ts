import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IInboxRepository } from '@prodforcode/event-forge-core';

import { InboxConsumerService } from '../services/inbox-consumer.service';
import { InboxConsumerOptions } from '../interfaces/inbox-consumer-options.interface';
import { INBOX_SUBSCRIBE_METADATA } from '../decorators/inbox-subscribe.decorator';

describe('InboxConsumerService', () => {
  let service: InboxConsumerService;
  let inboxRepository: jest.Mocked<IInboxRepository>;
  let discoveryService: jest.Mocked<DiscoveryService>;
  let metadataScanner: jest.Mocked<MetadataScanner>;
  let reflector: jest.Mocked<Reflector>;

  const mockOptions: InboxConsumerOptions = {
    defaultSource: 'test-service',
    logDuplicates: true,
  };

  beforeEach(async () => {
    const mockInboxRepository: jest.Mocked<IInboxRepository> = {
      record: jest.fn(),
      exists: jest.fn(),
      markProcessing: jest.fn(),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
      findRetryable: jest.fn(),
      deleteOlderThan: jest.fn(),
    };

    const mockDiscoveryService = {
      getProviders: jest.fn().mockReturnValue([]),
      getControllers: jest.fn().mockReturnValue([]),
      getMetadataByDecorator: jest.fn(),
    };

    const mockMetadataScanner = {
      getAllMethodNames: jest.fn().mockReturnValue([]),
      scanFromPrototype: jest.fn(),
      getAllFilteredMethodNames: jest.fn(),
    };

    const mockReflector = {
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: InboxConsumerService,
          useFactory: (
            discovery: DiscoveryService,
            scanner: MetadataScanner,
            reflector: Reflector,
          ) => {
            return new InboxConsumerService(
              discovery,
              scanner,
              reflector,
              mockInboxRepository,
              mockOptions,
            );
          },
          inject: [DiscoveryService, MetadataScanner, Reflector],
        },
        {
          provide: DiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: MetadataScanner,
          useValue: mockMetadataScanner,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    service = module.get<InboxConsumerService>(InboxConsumerService);
    inboxRepository = mockInboxRepository;
    discoveryService = mockDiscoveryService as unknown as jest.Mocked<DiscoveryService>;
    metadataScanner = mockMetadataScanner as unknown as jest.Mocked<MetadataScanner>;
    reflector = mockReflector as unknown as jest.Mocked<Reflector>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should discover and wrap decorated methods', async () => {
      const mockHandler = jest.fn();
      const mockInstance = {
        handleMessage: mockHandler,
      };

      discoveryService.getProviders.mockReturnValue([
        {
          instance: mockInstance,
          isAlias: false,
        } as any,
      ]);

      metadataScanner.getAllMethodNames.mockReturnValue(['handleMessage']);

      reflector.get.mockReturnValue({
        exchange: 'events',
        routingKey: 'test.event',
        source: 'test-source',
      });

      await service.onModuleInit();

      expect(discoveryService.getProviders).toHaveBeenCalled();
      expect(metadataScanner.getAllMethodNames).toHaveBeenCalled();
      expect(reflector.get).toHaveBeenCalledWith(
        INBOX_SUBSCRIBE_METADATA,
        mockHandler,
      );
    });

    it('should skip instances without metadata', async () => {
      const mockInstance = {
        handleMessage: jest.fn(),
      };

      discoveryService.getProviders.mockReturnValue([
        {
          instance: mockInstance,
          isAlias: false,
        } as any,
      ]);

      metadataScanner.getAllMethodNames.mockReturnValue(['handleMessage']);
      reflector.get.mockReturnValue(undefined);

      await service.onModuleInit();

      expect(reflector.get).toHaveBeenCalled();
    });
  });

  describe('handleInboxMessage', () => {
    it('should record message and invoke handler for non-duplicate', async () => {
      const message = {
        properties: { messageId: 'msg-123', type: 'user.created' },
        content: { userId: '1', name: 'John' },
      };

      const mockHandler = jest.fn().mockResolvedValue('success');
      const mockContext = {};

      inboxRepository.record.mockResolvedValue({
        message: { id: 'inbox-1' } as any,
        isDuplicate: false,
      });

      const metadata = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      const result = await (service as any).handleInboxMessage(
        message,
        metadata,
        mockHandler,
        mockContext,
        [message],
      );

      expect(inboxRepository.record).toHaveBeenCalledWith({
        messageId: 'msg-123',
        source: 'user-service',
        eventType: 'user.created',
        payload: message,
      });

      expect(mockHandler).toHaveBeenCalledWith(message);
      expect(result).toBe('success');
    });

    it('should skip handler for duplicate message', async () => {
      const message = {
        properties: { messageId: 'msg-123', type: 'user.created' },
        content: { userId: '1', name: 'John' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      inboxRepository.record.mockResolvedValue({
        message: { id: 'inbox-1' } as any,
        isDuplicate: true,
      });

      const metadata = {
        exchange: 'events',
        routingKey: 'user.created',
        source: 'user-service',
      };

      const result = await (service as any).handleInboxMessage(
        message,
        metadata,
        mockHandler,
        mockContext,
        [message],
      );

      expect(inboxRepository.record).toHaveBeenCalled();
      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should use custom messageIdExtractor', async () => {
      const message = {
        headers: { customId: 'custom-123' },
        content: { data: 'test' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      inboxRepository.record.mockResolvedValue({
        message: { id: 'inbox-1' } as any,
        isDuplicate: false,
      });

      const metadata = {
        exchange: 'events',
        routingKey: 'test.event',
        source: 'test-service',
        messageIdExtractor: (msg: any) => msg.headers.customId,
      };

      await (service as any).handleInboxMessage(
        message,
        metadata,
        mockHandler,
        mockContext,
        [message],
      );

      expect(inboxRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'custom-123',
        }),
      );
    });

    it('should use custom eventTypeExtractor', async () => {
      const message = {
        properties: { messageId: 'msg-123' },
        headers: { eventName: 'CustomEvent' },
        content: { data: 'test' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      inboxRepository.record.mockResolvedValue({
        message: { id: 'inbox-1' } as any,
        isDuplicate: false,
      });

      const metadata = {
        exchange: 'events',
        routingKey: 'test.event',
        source: 'test-service',
        eventTypeExtractor: (msg: any) => msg.headers.eventName,
      };

      await (service as any).handleInboxMessage(
        message,
        metadata,
        mockHandler,
        mockContext,
        [message],
      );

      expect(inboxRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CustomEvent',
        }),
      );
    });

    it('should use defaultSource from options when not in metadata', async () => {
      const message = {
        properties: { messageId: 'msg-123', type: 'test.event' },
        content: { data: 'test' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      inboxRepository.record.mockResolvedValue({
        message: { id: 'inbox-1' } as any,
        isDuplicate: false,
      });

      const metadata = {
        exchange: 'events',
        routingKey: 'test.event',
      };

      await (service as any).handleInboxMessage(
        message,
        metadata,
        mockHandler,
        mockContext,
        [message],
      );

      expect(inboxRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'test-service',
        }),
      );
    });

    it('should throw error if source cannot be determined', async () => {
      const message = {
        properties: { messageId: 'msg-123', type: 'test.event' },
        content: { data: 'test' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      const metadata = {
        exchange: 'events',
        routingKey: 'test.event',
      };

      const serviceWithoutDefaultSource = new InboxConsumerService(
        discoveryService,
        metadataScanner,
        reflector,
        inboxRepository,
        {},
      );

      await expect(
        (serviceWithoutDefaultSource as any).handleInboxMessage(
          message,
          metadata,
          mockHandler,
          mockContext,
          [message],
        ),
      ).rejects.toThrow('Source identifier is required');
    });

    it('should throw error if messageId cannot be extracted', async () => {
      const message = {
        content: { data: 'test' },
      };

      const mockHandler = jest.fn();
      const mockContext = {};

      const metadata = {
        exchange: 'events',
        routingKey: 'test.event',
        source: 'test-service',
      };

      await expect(
        (service as any).handleInboxMessage(
          message,
          metadata,
          mockHandler,
          mockContext,
          [message],
        ),
      ).rejects.toThrow('Unable to extract message ID');
    });
  });

  describe('extractMessageId', () => {
    it('should extract id from message body (EventForge format)', () => {
      const message = {
        id: 'test-uuid-123',
        aggregateType: 'workflow',
        payload: {},
      };
      const result = (service as any).extractMessageId(message as any, {});
      expect(result).toBe('test-uuid-123');
    });

    it('should prefer custom extractor over message.id', () => {
      const message = { id: 'body-id' };
      const metadata = { messageIdExtractor: () => 'custom-id' };
      const result = (service as any).extractMessageId(message as any, metadata);
      expect(result).toBe('custom-id');
    });

    it('should fallback to properties.messageId', () => {
      const message = { properties: { messageId: 'props-id' } };
      const result = (service as any).extractMessageId(message as any, {});
      expect(result).toBe('props-id');
    });
  });
});
