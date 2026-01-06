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
exports.OutboxMessageEntity = void 0;
const typeorm_1 = require("typeorm");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
let OutboxMessageEntity = class OutboxMessageEntity {
    id;
    aggregateType;
    aggregateId;
    eventType;
    payload;
    metadata;
    status;
    retryCount;
    maxRetries;
    errorMessage;
    scheduledAt;
    lockedBy;
    lockedAt;
    createdAt;
    updatedAt;
};
exports.OutboxMessageEntity = OutboxMessageEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "aggregateType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "aggregateId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255 }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "eventType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], OutboxMessageEntity.prototype, "payload", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], OutboxMessageEntity.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: inbox_outbox_core_1.OutboxMessageStatus,
        default: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
    }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], OutboxMessageEntity.prototype, "retryCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 3 }),
    __metadata("design:type", Number)
], OutboxMessageEntity.prototype, "maxRetries", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], OutboxMessageEntity.prototype, "scheduledAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", String)
], OutboxMessageEntity.prototype, "lockedBy", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], OutboxMessageEntity.prototype, "lockedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], OutboxMessageEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], OutboxMessageEntity.prototype, "updatedAt", void 0);
exports.OutboxMessageEntity = OutboxMessageEntity = __decorate([
    (0, typeorm_1.Entity)('outbox_messages'),
    (0, typeorm_1.Index)(['status', 'scheduledAt', 'createdAt'], {
        where: 'status IN (\'pending\', \'failed\')',
    }),
    (0, typeorm_1.Index)(['aggregateType', 'aggregateId']),
    (0, typeorm_1.Index)(['eventType']),
    (0, typeorm_1.Index)(['createdAt'])
], OutboxMessageEntity);
//# sourceMappingURL=outbox-message.entity.js.map