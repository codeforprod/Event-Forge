"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxService = exports.InboxEvents = void 0;
const events_1 = require("events");
const inbox_config_1 = require("../config/inbox.config");
const duplicate_message_error_1 = require("../errors/duplicate-message.error");
const processing_error_1 = require("../errors/processing.error");
var InboxEvents;
(function (InboxEvents) {
    InboxEvents["MESSAGE_RECEIVED"] = "inbox:message:received";
    InboxEvents["MESSAGE_DUPLICATE"] = "inbox:message:duplicate";
    InboxEvents["MESSAGE_PROCESSED"] = "inbox:message:processed";
    InboxEvents["MESSAGE_FAILED"] = "inbox:message:failed";
})(InboxEvents || (exports.InboxEvents = InboxEvents = {}));
class InboxService extends events_1.EventEmitter {
    repository;
    config;
    handlers = new Map();
    cleanupTimer;
    constructor(repository, config) {
        super();
        this.repository = repository;
        this.config = { ...inbox_config_1.DEFAULT_INBOX_CONFIG, ...config };
    }
    registerHandler(eventType, handler) {
        const existingHandlers = this.handlers.get(eventType) || [];
        existingHandlers.push(handler);
        this.handlers.set(eventType, existingHandlers);
    }
    unregisterHandler(eventType, handler) {
        const existingHandlers = this.handlers.get(eventType);
        if (!existingHandlers) {
            return;
        }
        const index = existingHandlers.indexOf(handler);
        if (index > -1) {
            existingHandlers.splice(index, 1);
        }
        if (existingHandlers.length === 0) {
            this.handlers.delete(eventType);
        }
    }
    async receiveMessage(dto) {
        const result = await this.repository.record(dto);
        if (result.isDuplicate) {
            this.emit(InboxEvents.MESSAGE_DUPLICATE, result.message);
            throw new duplicate_message_error_1.DuplicateMessageError(dto.messageId, dto.source);
        }
        this.emit(InboxEvents.MESSAGE_RECEIVED, result.message);
        await this.processMessage(result.message);
    }
    async processMessage(message) {
        const handlers = this.handlers.get(message.eventType);
        if (!handlers || handlers.length === 0) {
            await this.repository.markProcessed(message.id);
            this.emit(InboxEvents.MESSAGE_PROCESSED, message);
            return;
        }
        try {
            await this.repository.markProcessing(message.id);
            await Promise.all(handlers.map((handler) => handler(message)));
            await this.repository.markProcessed(message.id);
            this.emit(InboxEvents.MESSAGE_PROCESSED, message);
        }
        catch (error) {
            await this.handleProcessingError(message, error);
        }
    }
    async handleProcessingError(message, error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.repository.markFailed(message.id, errorMessage);
        this.emit(InboxEvents.MESSAGE_FAILED, { message, error });
        if (error instanceof processing_error_1.ProcessingError) {
            throw error;
        }
        throw new Error(`Failed to process inbox message ${message.id}: ${errorMessage}`);
    }
    startCleanup() {
        if (this.cleanupTimer) {
            return;
        }
        this.cleanupTimer = setInterval(() => {
            void this.cleanup();
        }, this.config.cleanupInterval);
        void this.cleanup();
    }
    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
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
exports.InboxService = InboxService;
//# sourceMappingURL=inbox.service.js.map