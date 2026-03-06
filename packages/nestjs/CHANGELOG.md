# @prodforcode/event-forge-nestjs

## 1.5.0

### Minor Changes

- 17a270e: feat: add inbox message recovery mechanism for stuck messages
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

### Patch Changes

- Updated dependencies [17a270e]
  - @prodforcode/event-forge-core@1.5.0

## 1.0.1

### Patch Changes

- fix(npm): include dist/ folder in published packages

  Added .npmignore files to all packages to ensure compiled JavaScript code
  is included in npm tarballs. Previously, packages were published with empty
  dist/ folders due to .gitignore exclusion patterns.

- Updated dependencies
  - @prodforcode/event-forge-core@1.0.1
