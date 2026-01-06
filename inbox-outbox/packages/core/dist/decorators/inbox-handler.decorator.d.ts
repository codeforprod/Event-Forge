import 'reflect-metadata';
export declare const INBOX_HANDLER_METADATA = "inbox-outbox:inbox-handler";
export interface InboxHandlerOptions {
    eventType: string;
    source?: string;
}
export declare function InboxHandler(options: InboxHandlerOptions): MethodDecorator;
//# sourceMappingURL=inbox-handler.decorator.d.ts.map