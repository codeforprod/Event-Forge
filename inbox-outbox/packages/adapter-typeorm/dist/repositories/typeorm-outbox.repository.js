"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeOrmOutboxRepository = void 0;
const typeorm_1 = require("typeorm");
const inbox_outbox_core_1 = require("@event-forge/inbox-outbox-core");
const outbox_message_entity_1 = require("../entities/outbox-message.entity");
class TypeOrmOutboxRepository {
    dataSource;
    repository;
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.repository = dataSource.getRepository(outbox_message_entity_1.OutboxMessageEntity);
    }
    async create(dto, transactionContext) {
        const entityManager = transactionContext;
        const repo = entityManager?.getRepository(outbox_message_entity_1.OutboxMessageEntity) ?? this.repository;
        const entity = repo.create({
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
        const saved = await repo.save(entity);
        return saved;
    }
    async fetchAndLockPending(limit, lockerId) {
        const now = new Date();
        const query = this.repository
            .createQueryBuilder('outbox')
            .where('outbox.status IN (:...statuses)', {
            statuses: [inbox_outbox_core_1.OutboxMessageStatus.PENDING, inbox_outbox_core_1.OutboxMessageStatus.FAILED],
        })
            .andWhere('(outbox.scheduledAt IS NULL OR outbox.scheduledAt <= :now)', { now })
            .andWhere('(outbox.lockedAt IS NULL OR outbox.lockedAt < :lockTimeout)', { lockTimeout: new Date(Date.now() - 5 * 60 * 1000) })
            .orderBy('outbox.createdAt', 'ASC')
            .limit(limit)
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked');
        const messages = await query.getMany();
        if (messages.length > 0) {
            const ids = messages.map((m) => m.id);
            await this.repository.update(ids, {
                status: inbox_outbox_core_1.OutboxMessageStatus.PROCESSING,
                lockedBy: lockerId,
                lockedAt: new Date(),
            });
            return this.repository.findByIds(ids);
        }
        return [];
    }
    async markPublished(id) {
        await this.repository.update(id, {
            status: inbox_outbox_core_1.OutboxMessageStatus.PUBLISHED,
            lockedBy: null,
            lockedAt: null,
        });
    }
    async markFailed(id, error, permanent = false) {
        const message = await this.repository.findOne({ where: { id } });
        if (!message) {
            return;
        }
        const status = permanent
            ? inbox_outbox_core_1.OutboxMessageStatus.PERMANENTLY_FAILED
            : inbox_outbox_core_1.OutboxMessageStatus.FAILED;
        await this.repository.update(id, {
            status,
            retryCount: message.retryCount + 1,
            errorMessage: error,
            lockedBy: null,
            lockedAt: null,
        });
    }
    async releaseLock(id) {
        await this.repository.update(id, {
            status: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
            lockedBy: null,
            lockedAt: null,
        });
    }
    async releaseStaleLocks(olderThan) {
        const result = await this.repository
            .createQueryBuilder()
            .update(outbox_message_entity_1.OutboxMessageEntity)
            .set({
            status: inbox_outbox_core_1.OutboxMessageStatus.PENDING,
            lockedBy: null,
            lockedAt: null,
        })
            .where('status = :status', { status: inbox_outbox_core_1.OutboxMessageStatus.PROCESSING })
            .andWhere('lockedAt < :olderThan', { olderThan })
            .execute();
        return result.affected ?? 0;
    }
    async deleteOlderThan(date) {
        const result = await this.repository.delete({
            status: inbox_outbox_core_1.OutboxMessageStatus.PUBLISHED,
            createdAt: (0, typeorm_1.LessThan)(date),
        });
        return result.affected ?? 0;
    }
    async withTransaction(operation) {
        return this.dataSource.transaction(async (entityManager) => {
            return operation(entityManager);
        });
    }
}
exports.TypeOrmOutboxRepository = TypeOrmOutboxRepository;
//# sourceMappingURL=typeorm-outbox.repository.js.map