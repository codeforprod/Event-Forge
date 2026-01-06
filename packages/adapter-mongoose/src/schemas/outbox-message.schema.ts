import { OutboxMessage, OutboxMessageStatus } from '@event-forge/inbox-outbox-core';
import { Schema, Document, Model, Types } from 'mongoose';

/**
 * Mongoose Document interface for OutboxMessage
 */
export interface OutboxMessageDocument extends Omit<Document, 'id'>, Omit<OutboxMessage, 'id'> {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose Schema for Outbox Messages
 * Compatible with message-relay schema for smooth migration
 */
export const OutboxMessageSchema = new Schema<OutboxMessageDocument>(
  {
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
      type: Schema.Types.Mixed,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(OutboxMessageStatus),
      default: OutboxMessageStatus.PENDING,
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
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: 'outbox_messages',
  },
);

/**
 * Compound index for efficient querying of pending messages
 * Optimizes the fetchAndLockPending query
 */
OutboxMessageSchema.index(
  {
    status: 1,
    scheduledAt: 1,
    createdAt: 1,
  },
  {
    name: 'idx_outbox_pending_processing',
  },
);

/**
 * Index for cleanup operations
 */
OutboxMessageSchema.index(
  {
    status: 1,
    createdAt: 1,
  },
  {
    name: 'idx_outbox_cleanup',
  },
);

/**
 * Index for stale lock release
 */
OutboxMessageSchema.index(
  {
    status: 1,
    lockedAt: 1,
  },
  {
    name: 'idx_outbox_stale_locks',
  },
);

/**
 * Transform _id to id for consistency with OutboxMessage interface
 */
OutboxMessageSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    ret.id = ret._id.toString();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete ret._id;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ret;
  },
});

OutboxMessageSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    ret.id = ret._id.toString();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete ret._id;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return ret;
  },
});

/**
 * Type for Mongoose Model
 */
export type OutboxMessageModel = Model<OutboxMessageDocument>;
