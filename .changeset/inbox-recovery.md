---
"@prodforcode/event-forge-core": minor
"@prodforcode/event-forge-typeorm": minor
"@prodforcode/event-forge-mongoose": minor
"@prodforcode/event-forge-nestjs": minor
"@prodforcode/event-forge-rabbitmq-consumer": minor
---

feat: add inbox message recovery mechanism for stuck messages

- Add InboxRecoveryService with configurable sweep interval for Tier 2 recovery
- Add recovery fields to InboxMessage: updatedAt, recoveryAttempts, lastRecoveredAt, recoveryReason
- Make markProcessing() atomic with boolean return (breaking: was void)
- Add status-aware deduplication in record() for PROCESSING/FAILED messages
- Add findStuckProcessing, resetForRetry, markPermanentlyFailedRecovery to IInboxRepository
- Add TypeORM migration for recovery columns and partial index
- Add Mongoose schema updates with recovery sweep index
- Integrate InboxRecoveryService into NestJS module with lifecycle management
- Update RabbitMQ consumer decorator with atomic markProcessing guard
- Update Python adapters (SQLAlchemy + Motor) with recovery support
