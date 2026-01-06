"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeOrmInboxRepository = void 0;
const typeorm_1 = require("typeorm");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
const inbox_message_entity_1 = require("../entities/inbox-message.entity");
class TypeOrmInboxRepository {
    repository;
    constructor(dataSource) {
        this.repository = dataSource.getRepository(inbox_message_entity_1.InboxMessageEntity);
    }
    async record(dto) {
        const existing = await this.repository.findOne({
            where: {
                messageId: dto.messageId,
                source: dto.source,
            },
        });
        if (existing) {
            return {
                message: existing,
                isDuplicate: true,
            };
        }
        const entity = this.repository.create({
            messageId: dto.messageId,
            source: dto.source,
            eventType: dto.eventType,
            payload: dto.payload,
            status: inbox_outbox_core_1.InboxMessageStatus.RECEIVED,
        });
        try {
            const saved = await this.repository.save(entity);
            return {
                message: saved,
                isDuplicate: false,
            };
        }
        catch (error) {
            if (error.code === '23505') {
                const existing = await this.repository.findOne({
                    where: {
                        messageId: dto.messageId,
                        source: dto.source,
                    },
                });
                return {
                    message: existing,
                    isDuplicate: true,
                };
            }
            throw error;
        }
    }
    async exists(messageId, source) {
        const count = await this.repository.count({
            where: {
                messageId,
                source,
            },
        });
        return count > 0;
    }
    async markProcessing(id) {
        await this.repository.update(id, {
            status: inbox_outbox_core_1.InboxMessageStatus.PROCESSING,
        });
    }
    async markProcessed(id) {
        await this.repository.update(id, {
            status: inbox_outbox_core_1.InboxMessageStatus.PROCESSED,
            processedAt: new Date(),
        });
    }
    async markFailed(id, error) {
        await this.repository.update(id, {
            status: inbox_outbox_core_1.InboxMessageStatus.FAILED,
            errorMessage: error,
        });
    }
    async deleteOlderThan(date) {
        const result = await this.repository.delete({
            status: inbox_outbox_core_1.InboxMessageStatus.PROCESSED,
            createdAt: (0, typeorm_1.LessThan)(date),
        });
        return result.affected ?? 0;
    }
}
exports.TypeOrmInboxRepository = TypeOrmInboxRepository;
//# sourceMappingURL=typeorm-inbox.repository.js.map