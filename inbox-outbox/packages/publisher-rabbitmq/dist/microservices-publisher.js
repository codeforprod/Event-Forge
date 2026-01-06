"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicroservicesPublisher = void 0;
class MicroservicesPublisher {
    clientProxy;
    constructor(clientProxy) {
        this.clientProxy = clientProxy;
    }
    async publish(message, options) {
        const pattern = this.buildPattern(message);
        const messageData = {
            id: message.id,
            aggregateType: message.aggregateType,
            aggregateId: message.aggregateId,
            eventType: message.eventType,
            payload: message.payload,
            metadata: {
                ...message.metadata,
                ...options?.headers,
                messageId: message.id,
                timestamp: message.createdAt.getTime(),
                persistent: true,
                contentType: 'application/json',
            },
            createdAt: message.createdAt,
        };
        await this.clientProxy.emit(pattern, messageData);
    }
    buildPattern(message) {
        return message.eventType;
    }
}
exports.MicroservicesPublisher = MicroservicesPublisher;
//# sourceMappingURL=microservices-publisher.js.map