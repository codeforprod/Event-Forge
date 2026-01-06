"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxMessageEntity = void 0;
const typeorm_1 = require("typeorm");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
let InboxMessageEntity = class InboxMessageEntity {
    id;
    messageId;
    source;
    eventType;
    payload;
    status;
    processedAt;
    errorMessage;
    createdAt;
};
exports.InboxMessageEntity = InboxMessageEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "messageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "source", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], InboxMessageEntity.prototype, "payload", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: inbox_outbox_core_1.InboxMessageStatus,
        default: inbox_outbox_core_1.InboxMessageStatus.RECEIVED,
    }),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], InboxMessageEntity.prototype, "processedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], InboxMessageEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], InboxMessageEntity.prototype, "createdAt", void 0);
exports.InboxMessageEntity = InboxMessageEntity = __decorate([
    (0, typeorm_1.Entity)('inbox_messages'),
    (0, typeorm_1.Index)(['messageId', 'source'], { unique: true }),
    (0, typeorm_1.Index)(['eventType']),
    (0, typeorm_1.Index)(['status']),
    (0, typeorm_1.Index)(['createdAt'])
], InboxMessageEntity);
//# sourceMappingURL=inbox-message.entity.js.map