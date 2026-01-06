"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DuplicateMessageError = void 0;
class DuplicateMessageError extends Error {
    messageId;
    source;
    constructor(messageId, source) {
        super(`Duplicate message: ${messageId} from ${source}`);
        this.messageId = messageId;
        this.source = source;
        this.name = 'DuplicateMessageError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.DuplicateMessageError = DuplicateMessageError;
//# sourceMappingURL=duplicate-message.error.js.map