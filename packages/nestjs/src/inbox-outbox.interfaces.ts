import {
  IOutboxRepository,
  IInboxRepository,
  IMessagePublisher,
  OutboxConfig,
  InboxConfig,
} from '@event-forge/inbox-outbox-core';
import { InjectionToken, ModuleMetadata, OptionalFactoryDependency, Type } from '@nestjs/common';

/**
 * Options for configuring the Inbox-Outbox module
 */
export interface InboxOutboxModuleOptions {
  outbox?: {
    repository: Type<IOutboxRepository> | IOutboxRepository;
    config?: Partial<OutboxConfig>;
  };
  inbox?: {
    repository: Type<IInboxRepository> | IInboxRepository;
    config?: Partial<InboxConfig>;
  };
  publisher?: Type<IMessagePublisher> | IMessagePublisher;
}

/**
 * Factory interface for async configuration
 */
export interface InboxOutboxModuleOptionsFactory {
  createInboxOutboxOptions(): Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
}

/**
 * Async options for module configuration
 */
export interface InboxOutboxModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<InboxOutboxModuleOptionsFactory>;
  useClass?: Type<InboxOutboxModuleOptionsFactory>;
  useFactory?: (
    ...args: unknown[]
  ) => Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
}
