import { IOutboxRepository, IInboxRepository, IMessagePublisher, OutboxConfig, InboxConfig } from '@event-forge/inbox-outbox-core';
import { ModuleMetadata, Type } from '@nestjs/common';
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
export interface InboxOutboxModuleOptionsFactory {
    createInboxOutboxOptions(): Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
}
export interface InboxOutboxModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useExisting?: Type<InboxOutboxModuleOptionsFactory>;
    useClass?: Type<InboxOutboxModuleOptionsFactory>;
    useFactory?: (...args: unknown[]) => Promise<InboxOutboxModuleOptions> | InboxOutboxModuleOptions;
    inject?: unknown[];
}
//# sourceMappingURL=inbox-outbox.interfaces.d.ts.map