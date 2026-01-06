"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingError = void 0;
class ProcessingError extends Error {
    messageId;
    eventType;
    cause;
    constructor(message, messageId, eventType, cause) {
        super(message);
        this.messageId = messageId;
        this.eventType = eventType;
        this.cause = cause;
        this.name = 'ProcessingError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ProcessingError = ProcessingError;
//# sourceMappingURL=processing.error.js.map