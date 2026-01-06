"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongooseInboxRepository = void 0;
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
class MongooseInboxRepository {
    model;
    constructor(model) {
        this.model = model;
    }
    async record(dto) {
        const existing = await this.model.findOne({
            messageId: dto.messageId,
            source: dto.source,
        });
        if (existing) {
            return {
                message: this.toInboxMessage(existing),
                isDuplicate: true,
            };
        }
        const document = new this.model({
            messageId: dto.messageId,
            source: dto.source,
            eventType: dto.eventType,
            payload: dto.payload,
            status: inbox_outbox_core_1.InboxMessageStatus.RECEIVED,
        });
        try {
            const saved = await document.save();
            return {
                message: this.toInboxMessage(saved),
                isDuplicate: false,
            };
        }
        catch (error) {
            if (error.code === 11000) {
                const existing = await this.model.findOne({
                    messageId: dto.messageId,
                    source: dto.source,
                });
                return {
                    message: this.toInboxMessage(existing),
                    isDuplicate: true,
                };
            }
            throw error;
        }
    }
    async exists(messageId, source) {
        const count = await this.model.countDocuments({
            messageId,
            source,
        });
        return count > 0;
    }
    async markProcessing(id) {
        await this.model.updateOne({ _id: id }, {
            $set: {
                status: inbox_outbox_core_1.InboxMessageStatus.PROCESSING,
            },
        });
    }
    async markProcessed(id) {
        await this.model.updateOne({ _id: id }, {
            $set: {
                status: inbox_outbox_core_1.InboxMessageStatus.PROCESSED,
            },
        });
    }
    async markFailed(id, error) {
        await this.model.updateOne({ _id: id }, {
            $set: {
                status: inbox_outbox_core_1.InboxMessageStatus.FAILED,
                errorMessage: error,
            },
        });
    }
    async deleteOlderThan(date) {
        const result = await this.model.deleteMany({
            status: inbox_outbox_core_1.InboxMessageStatus.PROCESSED,
            createdAt: { $lt: date },
        });
        return result.deletedCount;
    }
    toInboxMessage(doc) {
        return {
            id: doc._id.toString(),
            messageId: doc.messageId,
            source: doc.source,
            eventType: doc.eventType,
            payload: doc.payload,
            status: doc.status,
            errorMessage: doc.errorMessage ?? undefined,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        };
    }
}
exports.MongooseInboxRepository = MongooseInboxRepository;
//# sourceMappingURL=mongoose-inbox.repository.js.map