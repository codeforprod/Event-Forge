import { DynamicModule } from '@nestjs/common';
import { InboxOutboxModuleOptions, InboxOutboxModuleAsyncOptions } from './inbox-outbox.interfaces';
export declare class InboxOutboxModule {
    static forRoot(options: InboxOutboxModuleOptions): DynamicModule;
    static forRootAsync(options: InboxOutboxModuleAsyncOptions): DynamicModule;
    private static createProviders;
    private static createAsyncProviders;
    private static createAsyncOptionsProvider;
    private static createDynamicProviders;
    private static isType;
}
//# sourceMappingURL=inbox-outbox.module.d.ts.map