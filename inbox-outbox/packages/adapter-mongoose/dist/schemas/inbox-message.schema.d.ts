import { Schema, Document, Model, Types } from 'mongoose';
import { InboxMessage } from '@event-forge/inbox-outbox-core';
export interface InboxMessageDocument extends Omit<Document, 'id'>, Omit<InboxMessage, 'id'> {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const InboxMessageSchema: Schema<InboxMessageDocument, Model<InboxMessageDocument, any, any, any, Document<unknown, any, InboxMessageDocument, any, {}> & InboxMessageDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, InboxMessageDocument, Document<unknown, {}, import("mongoose").FlatRecord<InboxMessageDocument>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<InboxMessageDocument> & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export type InboxMessageModel = Model<InboxMessageDocument>;
//# sourceMappingURL=inbox-message.schema.d.ts.map