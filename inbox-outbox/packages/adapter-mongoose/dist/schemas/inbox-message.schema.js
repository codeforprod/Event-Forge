"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxMessageSchema = void 0;
const mongoose_1 = require("mongoose");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
exports.InboxMessageSchema = new mongoose_1.Schema({
    messageId: {
        type: String,
        required: true,
    },
    source: {
        type: String,
        required: true,
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
    status: {
        type: String,
        enum: Object.values(inbox_outbox_core_1.InboxMessageStatus),
        default: inbox_outbox_core_1.InboxMessageStatus.RECEIVED,
        index: true,
    },
    errorMessage: {
        type: String,
        default: null,
    },
}, {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'inbox_messages',
});
exports.InboxMessageSchema.index({
    messageId: 1,
    source: 1,
}, {
    unique: true,
    name: 'idx_inbox_message_source_unique',
});
exports.InboxMessageSchema.index({
    eventType: 1,
    createdAt: 1,
}, {
    name: 'idx_inbox_event_type',
});
exports.InboxMessageSchema.index({
    status: 1,
    createdAt: 1,
}, {
    name: 'idx_inbox_cleanup',
});
//# sourceMappingURL=inbox-message.schema.js.map