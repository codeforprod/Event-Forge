"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GolevelupPublisher = void 0;
class GolevelupPublisher {
    amqpConnection;
    exchange;
    constructor(amqpConnection, exchange) {
        this.amqpConnection = amqpConnection;
        this.exchange = exchange;
    }
    async publish(message, options) {
        const routingKey = this.buildRoutingKey(message);
        const rabbitMQOptions = {
            ...options,
            persistent: true,
            contentType: 'application/json',
            messageId: message.id,
            timestamp: message.createdAt.getTime(),
            headers: {
                ...options?.headers,
                'x-aggregate-type': message.aggregateType,
                'x-aggregate-id': message.aggregateId,
                'x-event-type': message.eventType,
            },
        };
        await this.amqpConnection.publish(this.exchange, routingKey, {
            id: message.id,
            aggregateType: message.aggregateType,
            aggregateId: message.aggregateId,
            eventType: message.eventType,
            payload: message.payload,
            metadata: message.metadata,
            createdAt: message.createdAt,
        }, rabbitMQOptions);
    }
    buildRoutingKey(message) {
        return `${message.aggregateType}.${message.eventType}`;
    }
}
exports.GolevelupPublisher = GolevelupPublisher;
//# sourceMappingURL=golevelup-publisher.js.map