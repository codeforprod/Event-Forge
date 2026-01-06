"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongooseOutboxRepository = void 0;
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
class MongooseOutboxRepository {
    connection;
    model;
    constructor(connection, model) {
        this.connection = connection;
        this.model = model;
    }
    async create(dto, transactionContext) {
        const session = transactionContext;
        const document = new this.model({
            aggregateType: dto.aggregateType,
            aggregateId: dto.aggregateId,
            eventType: dto.eventType,
            payload: dto.payload,
            metadata: dto.metadata,
            scheduledAt: dto.scheduledAt,
            maxRetries: dto.maxRetries ?? 3,
            status: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
            retryCount: 0,
        });
        const saved = await document.save({ session });
        return this.toOutboxMessage(saved);
    }
    async fetchAndLockPending(limit, lockerId) {
        const now = new Date();
        const lockTimeout = new Date(Date.now() - 5 * 60 * 1000);
        const messages = [];
        for (let i = 0; i < limit; i++) {
            const message = await this.model.findOneAndUpdate({
                status: { $in: [inbox_outbox_core_1.OutboxMessageStatus.PENDING, inbox_outbox_core_1.OutboxMessageStatus.FAILED] },
                $and: [
                    { $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }] },
                    { $or: [{ lockedAt: null }, { lockedAt: { $lt: lockTimeout } }] },
                ],
            }, {
                $set: {
                    status: inbox_outbox_core_1.OutboxMessageStatus.PROCESSING,
                    lockedBy: lockerId,
                    lockedAt: new Date(),
                },
            }, {
                new: true,
                sort: { createdAt: 1 },
            });
            if (!message) {
                break;
            }
            messages.push(message);
        }
        return messages.map((doc) => this.toOutboxMessage(doc));
    }
    async markPublished(id) {
        await this.model.updateOne({ _id: id }, {
            $set: {
                status: inbox_outbox_core_1.OutboxMessageStatus.PUBLISHED,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }
    async markFailed(id, error, permanent = false) {
        const message = await this.model.findById(id);
        if (!message) {
            return;
        }
        const status = permanent
            ? inbox_outbox_core_1.OutboxMessageStatus.PERMANENTLY_FAILED
            : inbox_outbox_core_1.OutboxMessageStatus.FAILED;
        await this.model.updateOne({ _id: id }, {
            $set: {
                status,
                errorMessage: error,
                lockedBy: null,
                lockedAt: null,
            },
            $inc: {
                retryCount: 1,
            },
        });
    }
    async releaseLock(id) {
        await this.model.updateOne({ _id: id }, {
            $set: {
                status: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
                lockedBy: null,
                lockedAt: null,
            },
        });
    }
    async releaseStaleLocks(olderThan) {
        const result = await this.model.updateMany({
            status: inbox_outbox_core_1.OutboxMessageStatus.PROCESSING,
            lockedAt: { $lt: olderThan },
        }, {
            $set: {
                status: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
                lockedBy: null,
                lockedAt: null,
            },
        });
        return result.modifiedCount;
    }
    async deleteOlderThan(date) {
        const result = await this.model.deleteMany({
            status: inbox_outbox_core_1.OutboxMessageStatus.PUBLISHED,
            createdAt: { $lt: date },
        });
        return result.deletedCount;
    }
    async withTransaction(operation) {
        const session = await this.connection.startSession();
        session.startTransaction();
        try {
            const result = await operation(session);
            await session.commitTransaction();
            return result;
        }
        catch (error) {
            await session.abortTransaction();
            throw error;
        }
        finally {
            await session.endSession();
        }
    }
    toOutboxMessage(doc) {
        return {
            id: doc._id.toString(),
            aggregateType: doc.aggregateType,
            aggregateId: doc.aggregateId,
            eventType: doc.eventType,
            payload: doc.payload,
            metadata: doc.metadata ?? {},
            status: doc.status,
            retryCount: doc.retryCount,
            maxRetries: doc.maxRetries,
            errorMessage: doc.errorMessage ?? undefined,
            scheduledAt: doc.scheduledAt ?? undefined,
            lockedBy: doc.lockedBy ?? undefined,
            lockedAt: doc.lockedAt ?? undefined,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
        };
    }
}
exports.MongooseOutboxRepository = MongooseOutboxRepository;
//# sourceMappingURL=mongoose-outbox.repository.js.map