import { RabbitMQModule, RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';
import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import type { InboxConsumerOptions } from './interfaces/inbox-consumer-options.interface';
import { InboxConsumerService } from './services/inbox-consumer.service';

/**
 * Injection token for InboxConsumerOptions
 */
export const INBOX_CONSUMER_OPTIONS = 'INBOX_CONSUMER_OPTIONS';

/**
 * Module that provides automatic inbox recording for RabbitMQ consumers
 *
 * This module integrates with @golevelup/nestjs-rabbitmq to provide
 * automatic inbox message recording before handler execution.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     InboxConsumerModule.forRoot({
 *       defaultSource: 'my-service',
 *       rabbitmq: {
 *         uri: 'amqp://localhost:5672',
 *         connectionInitOptions: { wait: true },
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class InboxConsumerModule {
  /**
   * Creates a dynamic module with inbox consumer configuration
   *
   * @param options - Configuration for inbox consumer and RabbitMQ connection
   */
  static forRoot(options?: InboxConsumerModuleOptions): DynamicModule {
    const inboxConsumerOptions: InboxConsumerOptions =
      options?.inboxConsumer ?? {};
    const rabbitmqOptions: RabbitMQConfig | Record<string, never> =
      options?.rabbitmq ?? {};

    const optionsProvider: Provider = {
      provide: INBOX_CONSUMER_OPTIONS,
      useValue: inboxConsumerOptions,
    };

    return {
      module: InboxConsumerModule,
      imports: [
        DiscoveryModule,
        RabbitMQModule.forRoot(rabbitmqOptions as RabbitMQConfig),
      ],
      providers: [optionsProvider, InboxConsumerService],
      exports: [InboxConsumerService],
      global: options?.isGlobal ?? false,
    };
  }

  /**
   * Creates a dynamic module for async configuration
   *
   * @param options - Async configuration options
   */
  static forRootAsync(
    options: InboxConsumerModuleAsyncOptions,
  ): DynamicModule {
    const optionsProvider: Provider = {
      provide: INBOX_CONSUMER_OPTIONS,
      useFactory: async (
        ...args: unknown[]
      ): Promise<InboxConsumerOptions> => {
        const config = await options.useFactory(...args);
        return config.inboxConsumer ?? {};
      },
      inject: options.inject || [],
    };

    return {
      module: InboxConsumerModule,
      imports: [
        DiscoveryModule,
        ...(options.imports || []),
        RabbitMQModule.forRootAsync({
          useFactory: async (...args: unknown[]): Promise<RabbitMQConfig> => {
            const config = await options.useFactory(...args);
            return (config.rabbitmq ?? {}) as RabbitMQConfig;
          },
          inject: options.inject || [],
        }),
      ],
      providers: [optionsProvider, InboxConsumerService],
      exports: [InboxConsumerService],
      global: options.isGlobal ?? false,
    };
  }
}

/**
 * Options for configuring the InboxConsumerModule
 */
export interface InboxConsumerModuleOptions {
  /**
   * Inbox consumer specific options
   */
  inboxConsumer?: InboxConsumerOptions;

  /**
   * RabbitMQ connection options
   * (passed directly to @golevelup/nestjs-rabbitmq)
   */
  rabbitmq?: RabbitMQConfig;

  /**
   * Whether to make the module global
   * Default: false
   */
  isGlobal?: boolean;
}

/**
 * Options for async module configuration
 */
export interface InboxConsumerModuleAsyncOptions {
  /**
   * Factory function to create module options
   */
  useFactory: (
    ...args: unknown[]
  ) => Promise<InboxConsumerModuleOptions> | InboxConsumerModuleOptions;

  /**
   * Dependencies to inject into the factory
   */
  inject?: Array<Type<unknown> | string | symbol>;

  /**
   * Modules to import
   */
  imports?: Array<Type<unknown> | DynamicModule>;

  /**
   * Whether to make the module global
   * Default: false
   */
  isGlobal?: boolean;
}
