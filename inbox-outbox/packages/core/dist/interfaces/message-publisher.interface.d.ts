import { OutboxMessage } from './outbox-message.interface';
export interface PublishOptions {
    exchange?: string;
    routingKey?: string;
    topic?: string;
    priority?: number;
    expiration?: number;
    headers?: Record<string, unknown>;
}
export interface IMessagePublisher {
    publish(message: OutboxMessage, options?: PublishOptions): Promise<void>;
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
    isConnected?(): boolean;
}
//# sourceMappingURL=message-publisher.interface.d.ts.map