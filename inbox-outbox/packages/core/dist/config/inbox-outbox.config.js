"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.INBOX_OUTBOX_CONFIG = void 0;
exports.INBOX_OUTBOX_CONFIG = Symbol('INBOX_OUTBOX_CONFIG');
exports.DEFAULT_CONFIG = {
    outbox: {
        pollingInterval: 1000,
        batchSize: 10,
        maxRetries: 5,
        lockTimeout: 30000,
        cleanupAfterDays: 7,
    },
    inbox: {
        cleanupAfterDays: 7,
    },
};
//# sourceMappingURL=inbox-outbox.config.js.map