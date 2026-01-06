import { Schema, Document, Model, Types } from 'mongoose';
import { OutboxMessage } from '@event-forge/inbox-outbox-core';
export interface OutboxMessageDocument extends Omit<Document, 'id'>, Omit<OutboxMessage, 'id'> {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OutboxMessageSchema: Schema<OutboxMessageDocument, Model<OutboxMessageDocument, any, any, any, Document<unknown, any, OutboxMessageDocument, any, {}> & OutboxMessageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, OutboxMessageDocument, Document<unknown, {}, import("mongoose").FlatRecord<OutboxMessageDocument>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<OutboxMessageDocument> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export type OutboxMessageModel = Model<OutboxMessageDocument>;
//# sourceMappingURL=outbox-message.schema.d.ts.map