"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxMessageSchema = void 0;
const mongoose_1 = require("mongoose");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
exports.OutboxMessageSchema = new mongoose_1.Schema({
    aggregateType: {
        type: String,
        required: true,
        index: true,
    },
    aggregateId: {
        type: String,
        required: true,
        index: true,
    },
    eventType: {
        type: String,
        required: true,
        index: true,
    },
    payload: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    status: {
        type: String,
        enum: Object.values(inbox_outbox_core_1.OutboxMessageStatus),
        default: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
        index: true,
    },
    retryCount: {
        type: Number,
        default: 0,
    },
    maxRetries: {
        type: Number,
        default: 3,
    },
    errorMessage: {
        type: String,
        default: null,
    },
    scheduledAt: {
        type: Date,
        default: null,
        index: true,
    },
    lockedBy: {
        type: String,
        default: null,
    },
    lockedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'outbox_messages',
});
exports.OutboxMessageSchema.index({
    status: 1,
    scheduledAt: 1,
    createdAt: 1,
}, {
    name: 'idx_outbox_pending_processing',
});
exports.OutboxMessageSchema.index({
    status: 1,
    createdAt: 1,
}, {
    name: 'idx_outbox_cleanup',
});
exports.OutboxMessageSchema.index({
    status: 1,
    lockedAt: 1,
}, {
    name: 'idx_outbox_stale_locks',
});
exports.OutboxMessageSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
    },
});
exports.OutboxMessageSchema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
    },
});
//# sourceMappingURL=outbox-message.schema.js.map