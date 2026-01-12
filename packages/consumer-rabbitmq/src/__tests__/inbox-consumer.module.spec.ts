import { DiscoveryModule } from '@nestjs/core';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { InboxConsumerModule, INBOX_CONSUMER_OPTIONS } from '../inbox-consumer.module';
import { InboxConsumerService } from '../services/inbox-consumer.service';

jest.mock('@golevelup/nestjs-rabbitmq', () => ({
  RabbitMQModule: {
    forRoot: jest.fn().mockReturnValue({
      module: 'MockRabbitMQModule',
      providers: [],
      exports: [],
    }),
    forRootAsync: jest.fn().mockReturnValue({
      module: 'MockRabbitMQModule',
      providers: [],
      exports: [],
    }),
  },
}));

describe('InboxConsumerModule', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('forRoot', () => {
    it('should create module with default options', () => {
      const module = InboxConsumerModule.forRoot();

      expect(module.module).toBe(InboxConsumerModule);
      expect(module.imports).toContain(DiscoveryModule);
      expect(module.providers).toHaveLength(2);
      expect(module.exports).toContain(InboxConsumerService);
      expect(module.global).toBe(false);
    });

    it('should create module with custom options', () => {
      const options = {
        inboxConsumer: {
          defaultSource: 'my-service',
          logDuplicates: false,
        },
        rabbitmq: {
          uri: 'amqp://localhost:5672',
        },
        isGlobal: true,
      };

      const module = InboxConsumerModule.forRoot(options);

      expect(module.module).toBe(InboxConsumerModule);
      expect(module.global).toBe(true);

      expect(RabbitMQModule.forRoot).toHaveBeenCalledWith(options.rabbitmq);
    });

    it('should provide InboxConsumerOptions', () => {
      const options = {
        inboxConsumer: {
          defaultSource: 'test-service',
        },
      };

      const module = InboxConsumerModule.forRoot(options);

      const optionsProvider = module.providers?.find(
        (p: any) => p.provide === INBOX_CONSUMER_OPTIONS,
      );

      expect(optionsProvider).toBeDefined();
      expect((optionsProvider as any).useValue).toEqual(options.inboxConsumer);
    });
  });

  describe('forRootAsync', () => {
    it('should create module with async configuration', () => {
      const asyncOptions = {
        useFactory: jest.fn().mockResolvedValue({
          inboxConsumer: {
            defaultSource: 'async-service',
          },
          rabbitmq: {
            uri: 'amqp://localhost:5672',
          },
        }),
        inject: [],
      };

      const module = InboxConsumerModule.forRootAsync(asyncOptions);

      expect(module.module).toBe(InboxConsumerModule);
      expect(module.imports).toContain(DiscoveryModule);
      expect(module.providers).toHaveLength(2);
      expect(module.exports).toContain(InboxConsumerService);
    });

    it('should create module with global flag', () => {
      const asyncOptions = {
        useFactory: jest.fn().mockResolvedValue({}),
        inject: [],
        isGlobal: true,
      };

      const module = InboxConsumerModule.forRootAsync(asyncOptions);

      expect(module.global).toBe(true);
    });

    it('should pass imports to module', () => {
      const mockImport = { module: 'MockImport' } as any;
      const asyncOptions = {
        useFactory: jest.fn().mockResolvedValue({}),
        inject: [],
        imports: [mockImport],
      };

      const module = InboxConsumerModule.forRootAsync(asyncOptions);

      expect(module.imports).toContain(mockImport);
    });
  });
});
