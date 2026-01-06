import { IMessagePublisher, OutboxMessage, PublishOptions } from '@event-forge/inbox-outbox-core';
export interface RabbitMQPublishOptions extends PublishOptions {
    persistent?: boolean;
    contentType?: string;
    messageId?: string;
    timestamp?: number;
}
export interface AmqpConnection {
    publish<T = unknown>(exchange: string, routingKey: string, message: T, options?: RabbitMQPublishOptions): Promise<void>;
}
export declare class GolevelupPublisher implements IMessagePublisher {
    private readonly amqpConnection;
    private readonly exchange;
    constructor(amqpConnection: AmqpConnection, exchange: string);
    publish(message: OutboxMessage, options?: PublishOptions): Promise<void>;
    private buildRoutingKey;
}
//# sourceMappingURL=golevelup-publisher.d.ts.map