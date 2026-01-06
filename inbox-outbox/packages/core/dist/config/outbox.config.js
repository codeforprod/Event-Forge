"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OUTBOX_CONFIG = void 0;
exports.DEFAULT_OUTBOX_CONFIG = {
    pollingInterval: 1000,
    batchSize: 10,
    maxRetries: 3,
    lockTimeoutSeconds: 300,
    backoffBaseSeconds: 2,
    maxBackoffSeconds: 3600,
    cleanupInterval: 86400000,
    retentionDays: 7,
    immediateProcessing: true,
    workerId: `${process.env.HOSTNAME || 'unknown'}-${process.pid}`,
};
//# sourceMappingURL=outbox.config.js.map