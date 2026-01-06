import { Schema, Document, Model, Types } from 'mongoose';
import { InboxMessage, InboxMessageStatus } from '@event-forge/inbox-outbox-core';

/**
 * Mongoose Document interface for InboxMessage
 */
export interface InboxMessageDocument extends Omit<Document, 'id'>, Omit<InboxMessage, 'id'> {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose Schema for Inbox Messages
 */
export const InboxMessageSchema = new Schema<InboxMessageDocument>(
  {
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
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(InboxMessageStatus),
      default: InboxMessageStatus.RECEIVED,
      index: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'inbox_messages',
  },
);

/**
 * Unique compound index for deduplication
 */
InboxMessageSchema.index(
  {
    messageId: 1,
    source: 1,
  },
  {
    unique: true,
    name: 'idx_inbox_message_source_unique',
  },
);

/**
 * Index for querying by eventType
 */
InboxMessageSchema.index(
  {
    eventType: 1,
    createdAt: 1,
  },
  {
    name: 'idx_inbox_event_type',
  },
);

/**
 * Index for cleanup operations
 */
InboxMessageSchema.index(
  {
    status: 1,
    createdAt: 1,
  },
  {
    name: 'idx_inbox_cleanup',
  },
);

/**
 * Type for Mongoose Model
 */
export type InboxMessageModel = Model<InboxMessageDocument>;
