import { IMessagePublisher, OutboxMessage, PublishOptions } from '@event-forge/inbox-outbox-core';
export interface ClientProxy {
    emit<TResult = unknown, TInput = unknown>(pattern: string, data: TInput): Promise<TResult> | TResult;
}
export declare class MicroservicesPublisher implements IMessagePublisher {
    private readonly clientProxy;
    constructor(clientProxy: ClientProxy);
    publish(message: OutboxMessage, options?: PublishOptions): Promise<void>;
    private buildPattern;
}
//# sourceMappingURL=microservices-publisher.d.ts.map