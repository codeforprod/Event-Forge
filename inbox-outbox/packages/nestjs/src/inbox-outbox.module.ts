import {
  OutboxService,
  InboxService,
  IOutboxRepository,
  IInboxRepository,
  IMessagePublisher,
} from '@event-forge/inbox-outbox-core';
import { DynamicModule, Module, Provider, Type } from '@nestjs/common';

import {
  INBOX_OUTBOX_OPTIONS,
  OUTBOX_REPOSITORY,
  INBOX_REPOSITORY,
  MESSAGE_PUBLISHER,
  OUTBOX_SERVICE,
  INBOX_SERVICE,
} from './inbox-outbox.constants';
import {
  InboxOutboxModuleOptions,
  InboxOutboxModuleAsyncOptions,
  InboxOutboxModuleOptionsFactory,
} from './inbox-outbox.interfaces';

/**
 * NestJS Module for Inbox-Outbox Pattern
 * Provides dependency injection for repositories and services
 */
@Module({})
export class InboxOutboxModule {
  /**
   * Register module with synchronous configuration
   */
  static forRoot(options: InboxOutboxModuleOptions): DynamicModule {
    const providers = this.createProviders(options);

    return {
      module: InboxOutboxModule,
      providers,
      exports: [OUTBOX_SERVICE, INBOX_SERVICE, OUTBOX_REPOSITORY, INBOX_REPOSITORY],
      global: true,
    };
  }

  /**
   * Register module with asynchronous configuration
   */
  static forRootAsync(options: InboxOutboxModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    return {
      module: InboxOutboxModule,
      imports: options.imports || [],
      providers: [
        ...asyncProviders,
        ...this.createDynamicProviders(),
      ],
      exports: [OUTBOX_SERVICE, INBOX_SERVICE, OUTBOX_REPOSITORY, INBOX_REPOSITORY],
      global: true,
    };
  }

  /**
   * Create providers for synchronous configuration
   */
  private static createProviders(options: InboxOutboxModuleOptions): Provider[] {
    const providers: Provider[] = [];

    // Options provider
    providers.push({
      provide: INBOX_OUTBOX_OPTIONS,
      useValue: options,
    });

    // Outbox repository provider
    if (options.outbox?.repository) {
      if (this.isType(options.outbox.repository)) {
        providers.push({
          provide: OUTBOX_REPOSITORY,
          useClass: options.outbox.repository,
        });
      } else {
        providers.push({
          provide: OUTBOX_REPOSITORY,
          useValue: options.outbox.repository,
        });
      }
    }

    // Inbox repository provider
    if (options.inbox?.repository) {
      if (this.isType(options.inbox.repository)) {
        providers.push({
          provide: INBOX_REPOSITORY,
          useClass: options.inbox.repository,
        });
      } else {
        providers.push({
          provide: INBOX_REPOSITORY,
          useValue: options.inbox.repository,
        });
      }
    }

    // Message publisher provider
    if (options.publisher) {
      if (this.isType(options.publisher)) {
        providers.push({
          provide: MESSAGE_PUBLISHER,
          useClass: options.publisher,
        });
      } else {
        providers.push({
          provide: MESSAGE_PUBLISHER,
          useValue: options.publisher,
        });
      }
    }

    // Service providers
    if (options.outbox) {
      providers.push({
        provide: OUTBOX_SERVICE,
        useFactory: (
          repository: IOutboxRepository,
          publisher: IMessagePublisher,
          opts: InboxOutboxModuleOptions,
        ) => {
          return new OutboxService(repository, publisher, opts.outbox?.config);
        },
        inject: [OUTBOX_REPOSITORY, MESSAGE_PUBLISHER, INBOX_OUTBOX_OPTIONS],
      });
    }

    if (options.inbox) {
      providers.push({
        provide: INBOX_SERVICE,
        useFactory: (repository: IInboxRepository, opts: InboxOutboxModuleOptions) => {
          return new InboxService(repository, opts.inbox?.config);
        },
        inject: [INBOX_REPOSITORY, INBOX_OUTBOX_OPTIONS],
      });
    }

    return providers;
  }

  /**
   * Create async providers for async configuration
   */
  private static createAsyncProviders(options: InboxOutboxModuleAsyncOptions): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [this.createAsyncOptionsProvider(options)];
    }

    if (options.useClass) {
      return [
        this.createAsyncOptionsProvider(options),
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
      ];
    }

    return [];
  }

  /**
   * Create async options provider
   */
  private static createAsyncOptionsProvider(
    options: InboxOutboxModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: INBOX_OUTBOX_OPTIONS,
        useFactory: options.useFactory,
        inject: (options.inject || []) as any[],
      };
    }

    if (options.useExisting) {
      return {
        provide: INBOX_OUTBOX_OPTIONS,
        useFactory: async (optionsFactory: InboxOutboxModuleOptionsFactory) =>
          optionsFactory.createInboxOutboxOptions(),
        inject: [options.useExisting],
      };
    }

    if (options.useClass) {
      return {
        provide: INBOX_OUTBOX_OPTIONS,
        useFactory: async (optionsFactory: InboxOutboxModuleOptionsFactory) =>
          optionsFactory.createInboxOutboxOptions(),
        inject: [options.useClass],
      };
    }

    throw new Error('Invalid async configuration');
  }

  /**
   * Create dynamic providers that depend on async options
   */
  private static createDynamicProviders(): Provider[] {
    return [
      {
        provide: OUTBOX_REPOSITORY,
        useFactory: (options: InboxOutboxModuleOptions) => {
          if (!options.outbox?.repository) {
            return null;
          }

          if (this.isType(options.outbox.repository)) {
            const RepositoryClass = options.outbox.repository;
            return new RepositoryClass();
          }

          return options.outbox.repository;
        },
        inject: [INBOX_OUTBOX_OPTIONS],
      },
      {
        provide: INBOX_REPOSITORY,
        useFactory: (options: InboxOutboxModuleOptions) => {
          if (!options.inbox?.repository) {
            return null;
          }

          if (this.isType(options.inbox.repository)) {
            const RepositoryClass = options.inbox.repository;
            return new RepositoryClass();
          }

          return options.inbox.repository;
        },
        inject: [INBOX_OUTBOX_OPTIONS],
      },
      {
        provide: MESSAGE_PUBLISHER,
        useFactory: (options: InboxOutboxModuleOptions) => {
          if (!options.publisher) {
            return null;
          }

          if (this.isType(options.publisher)) {
            const PublisherClass = options.publisher;
            return new PublisherClass();
          }

          return options.publisher;
        },
        inject: [INBOX_OUTBOX_OPTIONS],
      },
      {
        provide: OUTBOX_SERVICE,
        useFactory: (
          repository: IOutboxRepository,
          publisher: IMessagePublisher,
          options: InboxOutboxModuleOptions,
        ) => {
          if (!repository || !publisher) {
            return null;
          }
          return new OutboxService(repository, publisher, options.outbox?.config);
        },
        inject: [OUTBOX_REPOSITORY, MESSAGE_PUBLISHER, INBOX_OUTBOX_OPTIONS],
      },
      {
        provide: INBOX_SERVICE,
        useFactory: (repository: IInboxRepository, options: InboxOutboxModuleOptions) => {
          if (!repository) {
            return null;
          }
          return new InboxService(repository, options.inbox?.config);
        },
        inject: [INBOX_REPOSITORY, INBOX_OUTBOX_OPTIONS],
      },
    ];
  }

  /**
   * Check if value is a Type (constructor function)
   */
  private static isType<T>(value: unknown): value is Type<T> {
    return typeof value === 'function';
  }
}
