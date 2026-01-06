"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxService = exports.OutboxEvents = void 0;
const events_1 = require("events");
const outbox_config_1 = require("../config/outbox.config");
const processing_error_1 = require("../errors/processing.error");
var OutboxEvents;
(function (OutboxEvents) {
    OutboxEvents["MESSAGE_CREATED"] = "outbox:message:created";
    OutboxEvents["MESSAGE_PUBLISHED"] = "outbox:message:published";
    OutboxEvents["MESSAGE_FAILED"] = "outbox:message:failed";
    OutboxEvents["POLLING_STARTED"] = "outbox:polling:started";
    OutboxEvents["POLLING_STOPPED"] = "outbox:polling:stopped";
})(OutboxEvents || (exports.OutboxEvents = OutboxEvents = {}));
class OutboxService extends events_1.EventEmitter {
    repository;
    publisher;
    config;
    pollingTimer;
    cleanupTimer;
    isProcessing = false;
    constructor(repository, publisher, config) {
        super();
        this.repository = repository;
        this.publisher = publisher;
        this.config = { ...outbox_config_1.DEFAULT_OUTBOX_CONFIG, ...config };
    }
    async createMessage(dto, transactionContext) {
        const message = await this.repository.create({
            ...dto,
            maxRetries: dto.maxRetries ?? this.config.maxRetries,
        }, transactionContext);
        if (this.config.immediateProcessing) {
            this.emit(OutboxEvents.MESSAGE_CREATED, message.id);
        }
        return message;
    }
    async withTransaction(operation) {
        return this.repository.withTransaction(operation);
    }
    startPolling() {
        if (this.pollingTimer) {
            return;
        }
        this.emit(OutboxEvents.POLLING_STARTED);
        this.pollingTimer = setInterval(() => {
            void this.pollAndProcess();
        }, this.config.pollingInterval);
        void this.pollAndProcess();
        this.startCleanup();
    }
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
            this.emit(OutboxEvents.POLLING_STOPPED);
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    async processMessage(_messageId) {
        await this.pollAndProcess();
    }
    async pollAndProcess() {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;
        try {
            const lockTimeout = new Date(Date.now() - this.config.lockTimeoutSeconds * 1000);
            await this.repository.releaseStaleLocks(lockTimeout);
            const messages = await this.repository.fetchAndLockPending(this.config.batchSize, this.config.workerId);
            await Promise.all(messages.map((message) => this.publishMessage(message)));
        }
        catch (error) {
            this.emit('error', error);
        }
        finally {
            this.isProcessing = false;
        }
    }
    async publishMessage(message) {
        try {
            await this.publisher.publish(message);
            await this.repository.markPublished(message.id);
            this.emit(OutboxEvents.MESSAGE_PUBLISHED, message);
        }
        catch (error) {
            await this.handlePublishError(message, error);
        }
    }
    async handlePublishError(message, error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isPermanent = error instanceof processing_error_1.ProcessingError;
        if (message.retryCount >= message.maxRetries || isPermanent) {
            await this.repository.markFailed(message.id, errorMessage, true);
            this.emit(OutboxEvents.MESSAGE_FAILED, { message, error, permanent: true });
            return;
        }
        await this.repository.markFailed(message.id, errorMessage, false);
        this.emit(OutboxEvents.MESSAGE_FAILED, { message, error, permanent: false });
    }
    startCleanup() {
        this.cleanupTimer = setInterval(() => {
            void this.cleanup();
        }, this.config.cleanupInterval);
        void this.cleanup();
    }
    async cleanup() {
        try {
            const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
            const deleted = await this.repository.deleteOlderThan(cutoffDate);
            if (deleted > 0) {
                this.emit('cleanup', { deleted, cutoffDate });
            }
        }
        catch (error) {
            this.emit('error', error);
        }
    }
}
exports.OutboxService = OutboxService;
//# sourceMappingURL=outbox.service.js.map