import 'reflect-metadata';
export declare const OUTBOX_HANDLER_METADATA = "inbox-outbox:outbox-handler";
export interface OutboxHandlerOptions {
    eventType: string;
    cron?: string;
    eventBased?: boolean;
}
export declare function OutboxHandler(options: OutboxHandlerOptions): MethodDecorator;
//# sourceMappingURL=outbox-handler.decorator.d.ts.map