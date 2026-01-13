# Migration Guide: v1.0.5 → v1.1.0

Complete guide for upgrading Event-Forge from version 1.0.5 to 1.1.0.

## Table of Contents

- [Overview](#overview)
- [Breaking Changes](#breaking-changes)
- [New Features](#new-features)
- [Migration Steps](#migration-steps)
  - [Step 1: Update Dependencies](#step-1-update-dependencies)
  - [Step 2: Run Database Migrations](#step-2-run-database-migrations)
  - [Step 3: Update Configuration (Optional)](#step-3-update-configuration-optional)
  - [Step 4: Install RabbitMQ Consumer (Optional)](#step-4-install-rabbitmq-consumer-optional)
  - [Step 5: Test Your Application](#step-5-test-your-application)
- [Feature-by-Feature Migration](#feature-by-feature-migration)
- [Rollback Plan](#rollback-plan)
- [FAQ](#faq)

---

## Overview

### What's New in v1.1.0

Event-Forge v1.1.0 introduces three major enhancements to the Inbox-Outbox pattern:

1. **INBOX Retry Mechanism** (P1 - Medium Priority)
   - Optional automatic retry for failed INBOX messages
   - Exponential backoff with jitter
   - Opt-in via configuration (disabled by default)

2. **OUTBOX Backoff Implementation** (P2 - Low Priority)
   - Exponential backoff now properly applied to OUTBOX retries
   - Prevents retry storms
   - No configuration changes required

3. **RabbitMQ Consumer Module** (P0 - Critical)
   - **NEW PACKAGE**: `@prodforcode/event-forge-rabbitmq-consumer`
   - `@InboxSubscribe` decorator for automatic INBOX recording
   - Transparent deduplication
   - Integrates with `@golevelup/nestjs-rabbitmq`

### Upgrade Difficulty

- **For existing users NOT using new features**: ⭐ Easy (15 minutes)
- **For users enabling INBOX retry**: ⭐⭐ Medium (30 minutes)
- **For users adopting RabbitMQ Consumer**: ⭐⭐⭐ Advanced (1 hour)

### Compatibility

- ✅ **Backward Compatible**: All changes are opt-in
- ✅ **No Breaking Changes**: Existing code works without modifications
- ✅ **Database Migrations**: Additive only (no data loss)
- ⚠️ **Database Schema Changes**: New columns added to `inbox_messages` table

---

## Breaking Changes

**NONE** - This is a fully backward-compatible release.

All new features are opt-in via configuration:
- INBOX retry is **disabled by default** (`enableRetry: false`)
- OUTBOX backoff is applied automatically (transparent fix)
- RabbitMQ Consumer is a **separate optional package**

---

## New Features

### 1. INBOX Retry Mechanism

**Problem Solved:** INBOX messages that fail processing now have automatic retry capability.

**Before v1.1.0:**
```typescript
// Failed INBOX messages stayed failed forever
// Manual intervention required to reprocess
```

**After v1.1.0:**
```typescript
InboxOutboxModule.forRoot({
  inbox: {
    config: {
      enableRetry: true,           // NEW: Enable retry
      maxRetries: 3,               // NEW: Retry up to 3 times
      retryPollingInterval: 5000,  // NEW: Poll every 5 seconds
      backoffBaseSeconds: 5,       // NEW: Exponential backoff base
      maxBackoffSeconds: 3600,     // NEW: Max backoff (1 hour)
    },
  },
})
```

**Retry Schedule Example:**
- Attempt 1: Immediate
- Attempt 2: ~2 seconds later
- Attempt 3: ~4 seconds later
- Attempt 4: ~8 seconds later
- Status: `permanently_failed` after max retries

### 2. OUTBOX Exponential Backoff (Fixed)

**Problem Solved:** Config values `backoffBaseSeconds` and `maxBackoffSeconds` were not being used.

**Before v1.1.0:**
```typescript
// Retry delays were fixed, not exponential
// Config was ignored
```

**After v1.1.0:**
```typescript
// Automatic exponential backoff applied
// No configuration changes needed
// Formula: min(base * 2^retryCount, maxBackoff) + jitter(±10%)
```

### 3. RabbitMQ Consumer Module

**Problem Solved:** Manual INBOX recording for every RabbitMQ message handler.

**Before v1.1.0:**
```typescript
@RabbitSubscribe({
  exchange: 'events',
  routingKey: 'order.created',
  queue: 'order-service.inbox',
})
async handleOrderCreated(message: any) {
  // MANUAL: Record to INBOX
  await this.inboxService.receiveMessage({
    messageId: message.properties.messageId,
    source: 'payment-service',
    eventType: 'order.created',
    payload: message,
  });

  // MANUAL: Check for duplicates
  // Process message...
}
```

**After v1.1.0:**
```typescript
@InboxSubscribe({
  exchange: 'events',
  routingKey: 'order.created',
  queue: 'order-service.inbox',
  source: 'payment-service',  // NEW: Automatic INBOX source
})
async handleOrderCreated(message: any) {
  // AUTOMATIC: INBOX recording done before this method executes
  // AUTOMATIC: Duplicates filtered out
  // Just write your business logic!
  console.log('Processing order:', message);
}
```

---

## Migration Steps

### Step 1: Update Dependencies

#### Update All Packages to v1.1.0

```bash
npm install @prodforcode/event-forge-core@1.1.0 \
            @prodforcode/event-forge-nestjs@1.1.0 \
            @prodforcode/event-forge-typeorm@1.1.0 \
            @prodforcode/event-forge-rabbitmq@1.1.0
```

#### For MongoDB Users

```bash
npm install @prodforcode/event-forge-mongoose@1.1.0
```

#### Optional: Install RabbitMQ Consumer (NEW)

Only if you want to use the `@InboxSubscribe` decorator:

```bash
npm install @prodforcode/event-forge-rabbitmq-consumer@1.1.0 \
            @golevelup/nestjs-rabbitmq@^7.0.0
```

#### Verify Installation

```bash
npm list @prodforcode/event-forge-core
# Should show: @prodforcode/event-forge-core@1.1.0
```

---

### Step 2: Run Database Migrations

#### PostgreSQL / TypeORM Users

**Option A: Automatic Migration (Recommended)**

Using the new migration management system:

```bash
# Check pending migrations
npx event-forge migration:list --data-source=./src/config/data-source.ts

# Expected output:
# Status | Version       | Name
# -------|---------------|------------------------------
# ✅     | 1.0.5-001     | InitialSchema
# ⏳     | 1.0.6-001     | AddInboxRetryFields

# Run pending migrations
npx event-forge migration:run --data-source=./src/config/data-source.ts

# Expected output:
# Running pending migrations...
# ✓ Applied migration: 1.0.6-001 AddInboxRetryFields
# Successfully applied 1 migration(s)

# Verify
npx event-forge migration:list --data-source=./src/config/data-source.ts

# Expected output:
# Status | Version       | Name
# -------|---------------|------------------------------
# ✅     | 1.0.5-001     | InitialSchema
# ✅     | 1.0.6-001     | AddInboxRetryFields
```

**Option B: Manual Migration**

If you prefer manual SQL execution:

```sql
-- Add retry fields to inbox_messages table
ALTER TABLE inbox_messages ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inbox_messages ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;
ALTER TABLE inbox_messages ADD COLUMN scheduled_at TIMESTAMP WITH TIME ZONE;

-- Create index for retry queries (performance optimization)
CREATE INDEX idx_inbox_retry ON inbox_messages (
  status, retry_count, scheduled_at, created_at
);
```

#### MongoDB / Mongoose Users

**Automatic Schema Update:**

Mongoose schemas are automatically updated. No manual migration needed.

The new fields will be added automatically on first use:
- `retryCount` (default: 0)
- `maxRetries` (default: 3)
- `scheduledAt` (default: null)

**Compound Index Created Automatically:**
```javascript
{ status: 1, retryCount: 1, scheduledAt: 1, createdAt: 1 }
```

---

### Step 3: Update Configuration (Optional)

#### Enable INBOX Retry (Optional)

Only if you want automatic retry for failed INBOX messages:

```typescript
// src/app.module.ts
InboxOutboxModule.forRoot({
  inbox: {
    repository: TypeOrmInboxRepository,
    config: {
      // NEW in v1.1.0: Enable retry (default: false)
      enableRetry: true,

      // NEW: Retry configuration
      maxRetries: 3,                 // Retry up to 3 times
      retryPollingInterval: 5000,    // Poll every 5 seconds
      backoffBaseSeconds: 5,         // Start with 2 second delay
      maxBackoffSeconds: 3600,       // Cap at 1 hour
      retryBatchSize: 10,            // Process 10 retry messages per batch
      retryWorkerId: 'worker-1',     // Optional: worker identifier

      // Existing config (unchanged)
      retentionDays: 30,
    },
  },
  // ... rest of config
})
```

**If you DON'T enable retry:**

No changes needed! Your existing configuration continues to work:

```typescript
InboxOutboxModule.forRoot({
  inbox: {
    repository: TypeOrmInboxRepository,
    config: {
      retentionDays: 30,  // Only this is needed
    },
  },
})
```

#### OUTBOX Configuration (No Changes Required)

Exponential backoff is now automatically applied. Your existing config works:

```typescript
InboxOutboxModule.forRoot({
  outbox: {
    config: {
      pollingInterval: 5000,
      batchSize: 10,
      maxRetries: 3,
      backoffBaseSeconds: 5,      // NOW USED: Exponential backoff base
      maxBackoffSeconds: 300,     // NOW USED: Max backoff delay
      // ... rest unchanged
    },
  },
})
```

---

### Step 4: Install RabbitMQ Consumer (Optional)

Only if you want to use `@InboxSubscribe` decorator for automatic INBOX recording.

#### Install Package

```bash
npm install @prodforcode/event-forge-rabbitmq-consumer@1.1.0 @golevelup/nestjs-rabbitmq@^7.0.0
```

#### Update Module Imports

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { InboxConsumerModule } from '@prodforcode/event-forge-rabbitmq-consumer';
import { TypeOrmInboxRepository } from '@prodforcode/event-forge-typeorm';

@Module({
  imports: [
    // ... existing imports

    // NEW: Add RabbitMQ Consumer module
    InboxConsumerModule.forRoot({
      rabbitmq: {
        uri: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
        exchanges: [
          {
            name: 'events',
            type: 'topic',
          },
        ],
      },
      inbox: {
        repository: TypeOrmInboxRepository,
      },
      defaultSource: 'external-service',  // Default source for INBOX records
    }),
  ],
})
export class AppModule {}
```

#### Migrate Existing Handlers

**Before (v1.0.5):**

```typescript
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { InboxService } from '@prodforcode/event-forge-core';

@Injectable()
export class OrderEventConsumer {
  constructor(private readonly inboxService: InboxService) {}

  @RabbitSubscribe({
    exchange: 'events',
    routingKey: 'order.created',
    queue: 'order-service.order.created',
  })
  async handleOrderCreated(message: any) {
    // Manual INBOX recording
    const result = await this.inboxService.receiveMessage({
      messageId: message.properties.messageId,
      source: 'payment-service',
      eventType: 'order.created',
      payload: message,
    });

    if (result.isDuplicate) {
      console.log('Duplicate message, skipping');
      return;
    }

    // Business logic
    console.log('Processing order:', message);
  }
}
```

**After (v1.1.0):**

```typescript
import { Injectable } from '@nestjs/common';
import { InboxSubscribe } from '@prodforcode/event-forge-rabbitmq-consumer';

@Injectable()
export class OrderEventConsumer {
  // No need to inject InboxService anymore!

  @InboxSubscribe({
    exchange: 'events',
    routingKey: 'order.created',
    queue: 'order-service.order.created',
    source: 'payment-service',  // Specify source here
  })
  async handleOrderCreated(message: any) {
    // INBOX recording and deduplication handled automatically!
    // Just write business logic
    console.log('Processing order:', message);
  }
}
```

**Migration Checklist:**

- [x] Replace `@RabbitSubscribe` with `@InboxSubscribe`
- [x] Add `source` parameter to decorator
- [x] Remove manual `inboxService.receiveMessage()` calls
- [x] Remove duplicate checking logic
- [x] Remove `InboxService` injection (if only used for INBOX recording)

---

### Step 5: Test Your Application

#### Verify Migrations Applied

**TypeORM:**

```bash
npx event-forge migration:list --data-source=./src/config/data-source.ts
```

Expected: All migrations marked as ✅ (applied)

**Mongoose:**

Check database for new fields:

```bash
mongo
use myapp
db.inbox_messages.findOne()
```

Expected fields: `retryCount`, `maxRetries`, `scheduledAt`

#### Test OUTBOX Backoff

Create a failing message and observe retry delays:

```typescript
// Create a message that will fail to publish
await outboxService.createMessage({
  aggregateType: 'Test',
  aggregateId: '123',
  eventType: 'test.failing',
  payload: { test: true },
});

// Check logs for retry delays
// Expected: ~5s, ~10s, ~20s, ~40s, ~80s (with jitter)
```

#### Test INBOX Retry (If Enabled)

Create a failing INBOX handler:

```typescript
inboxService.registerHandler('test.event', async (message) => {
  throw new Error('Test failure');
});

await inboxService.receiveMessage({
  messageId: 'test-123',
  source: 'test',
  eventType: 'test.event',
  payload: {},
});

// Check database for retry attempts
// SELECT * FROM inbox_messages WHERE message_id = 'test-123';
// Expected: retry_count increments on each attempt
```

#### Test RabbitMQ Consumer (If Installed)

Send a test message to RabbitMQ:

```bash
# Using rabbitmqadmin
rabbitmqadmin publish exchange=events routing_key=order.created \
  payload='{"orderId":"123"}' \
  properties='{"message_id":"test-msg-123"}'
```

Expected:
1. INBOX record created automatically
2. Handler method executes
3. Duplicate messages filtered out (send same `message_id` twice)

#### Run Automated Tests

```bash
# Run unit tests
npm test

# Run integration tests (if available)
npm run test:e2e
```

---

## Feature-by-Feature Migration

### Migrating to INBOX Retry

**When to Enable:**
- ✅ Your INBOX handlers can fail due to transient errors (network, downstream service)
- ✅ You want automatic retry without manual intervention
- ✅ Your handlers are **idempotent** (safe to retry)

**When NOT to Enable:**
- ❌ Handlers are not idempotent
- ❌ Failures are permanent (bad data, validation errors)
- ❌ You have custom retry logic

**Configuration Example:**

```typescript
// Low-volume, fast retry
{
  enableRetry: true,
  maxRetries: 3,
  retryPollingInterval: 2000,     // Poll every 2 seconds
  backoffBaseSeconds: 1,          // Start with 1 second
  maxBackoffSeconds: 60,          // Cap at 1 minute
}

// High-volume, patient retry
{
  enableRetry: true,
  maxRetries: 5,
  retryPollingInterval: 10000,    // Poll every 10 seconds
  backoffBaseSeconds: 10,         // Start with 10 seconds
  maxBackoffSeconds: 3600,        // Cap at 1 hour
}
```

### Migrating to RabbitMQ Consumer

**Migration Strategy:**

1. **Gradual Migration** (Recommended):
   - Install `@prodforcode/event-forge-rabbitmq-consumer`
   - Migrate handlers one-by-one
   - Keep both `@RabbitSubscribe` and `@InboxSubscribe` during transition
   - Test each migrated handler thoroughly
   - Remove old handlers after verification

2. **Big Bang Migration** (Advanced):
   - Migrate all handlers at once
   - Requires thorough testing before deployment
   - Higher risk, faster completion

**Example: Gradual Migration**

```typescript
// OLD handler (keep temporarily)
@RabbitSubscribe({
  exchange: 'events',
  routingKey: 'order.created',
  queue: 'order-service.order.created.old',
})
async handleOrderCreatedOld(message: any) {
  // Old manual INBOX logic
}

// NEW handler (test in parallel)
@InboxSubscribe({
  exchange: 'events',
  routingKey: 'order.created',
  queue: 'order-service.order.created.new',
  source: 'payment-service',
})
async handleOrderCreatedNew(message: any) {
  // New automatic INBOX logic
}

// After verification: delete old handler, rename new handler
```

---

## Rollback Plan

### If Migration Fails

#### Rollback Dependencies

```bash
# Rollback to v1.0.5
npm install @prodforcode/event-forge-core@1.0.5 \
            @prodforcode/event-forge-nestjs@1.0.5 \
            @prodforcode/event-forge-typeorm@1.0.5 \
            @prodforcode/event-forge-rabbitmq@1.0.5
```

#### Rollback Database Migration (TypeORM)

```bash
# Using migration management system
npx event-forge migration:rollback --data-source=./src/config/data-source.ts --count=1

# Or manual SQL
```

```sql
-- Drop retry index
DROP INDEX idx_inbox_retry;

-- Remove retry columns
ALTER TABLE inbox_messages DROP COLUMN scheduled_at;
ALTER TABLE inbox_messages DROP COLUMN max_retries;
ALTER TABLE inbox_messages DROP COLUMN retry_count;
```

#### Rollback Database Migration (Mongoose)

No action needed - new fields are optional and harmless.

Optionally remove manually:

```javascript
db.inbox_messages.updateMany({}, {
  $unset: {
    retryCount: "",
    maxRetries: "",
    scheduledAt: ""
  }
});
```

#### Rollback Configuration

Remove new config options:

```typescript
InboxOutboxModule.forRoot({
  inbox: {
    config: {
      // REMOVE these lines
      // enableRetry: true,
      // maxRetries: 3,
      // retryPollingInterval: 5000,
      // backoffBaseSeconds: 5,
      // maxBackoffSeconds: 3600,

      retentionDays: 30,  // Keep existing config
    },
  },
})
```

#### Rollback RabbitMQ Consumer

```bash
# Uninstall package
npm uninstall @prodforcode/event-forge-rabbitmq-consumer @golevelup/nestjs-rabbitmq

# Remove module import
# Delete InboxConsumerModule.forRoot() from app.module.ts

# Restore manual INBOX recording in handlers
```

---

## FAQ

### Q: Do I need to enable INBOX retry?

**A:** No, it's completely optional. INBOX retry is disabled by default (`enableRetry: false`). Only enable if:
- You have transient failures in INBOX processing
- Your handlers are idempotent
- You want automatic retry without manual intervention

### Q: Will my existing code break after upgrade?

**A:** No, v1.1.0 is fully backward compatible. All new features are opt-in.

### Q: What happens to existing INBOX messages after migration?

**A:** Existing messages are unaffected:
- New columns get default values (`retry_count=0`, `max_retries=3`, `scheduled_at=NULL`)
- Message status remains unchanged
- No reprocessing occurs

### Q: Do I need to install RabbitMQ Consumer package?

**A:** No, it's optional. Install only if you:
- Use RabbitMQ for message consumption
- Want automatic INBOX recording with `@InboxSubscribe` decorator
- Want to eliminate boilerplate INBOX code

### Q: Can I use both `@RabbitSubscribe` and `@InboxSubscribe` in the same app?

**A:** Yes! You can gradually migrate handlers. Both decorators can coexist.

### Q: What's the difference between INBOX retry and OUTBOX retry?

| Feature | INBOX Retry | OUTBOX Retry |
|---------|-------------|--------------|
| **Purpose** | Retry failed incoming message processing | Retry failed outgoing message publishing |
| **Default** | Disabled (NEW in v1.1.0) | Always enabled |
| **Opt-in** | `enableRetry: true` | Always on |
| **Use Case** | External message processing fails | Message broker publish fails |

### Q: How does exponential backoff work?

**Formula:** `min(base * 2^retryCount, maxBackoff) + jitter(±10%)`

**Example with `backoffBaseSeconds=5`, `maxBackoffSeconds=300`:**

| Retry | Calculation | Delay (without jitter) | Delay (with jitter) |
|-------|-------------|------------------------|---------------------|
| 1 | 5 * 2^0 = 5s | 5s | ~4.5s - 5.5s |
| 2 | 5 * 2^1 = 10s | 10s | ~9s - 11s |
| 3 | 5 * 2^2 = 20s | 20s | ~18s - 22s |
| 4 | 5 * 2^3 = 40s | 40s | ~36s - 44s |
| 5 | 5 * 2^4 = 80s | 80s | ~72s - 88s |
| 6 | 5 * 2^5 = 160s | 160s | ~144s - 176s |
| 7 | 5 * 2^6 = 320s → 300s (capped) | 300s | ~270s - 330s |

### Q: How do I monitor retry activity?

**Check Database:**

```sql
-- Count messages by retry status
SELECT
  status,
  AVG(retry_count) as avg_retries,
  MAX(retry_count) as max_retries,
  COUNT(*) as count
FROM inbox_messages
GROUP BY status;

-- Find messages scheduled for retry
SELECT id, event_type, retry_count, scheduled_at
FROM inbox_messages
WHERE status = 'failed'
  AND retry_count < max_retries
  AND scheduled_at IS NOT NULL
ORDER BY scheduled_at ASC
LIMIT 10;
```

**Enable Logging:**

```typescript
InboxOutboxModule.forRoot({
  logging: {
    level: 'debug',  // Enable detailed logs
    enabled: true,
  },
})
```

### Q: Can I change retry config after deployment?

**A:** Yes! Config changes take effect on next app restart. However:
- ⚠️ Messages already scheduled for retry use old backoff values
- ⚠️ Only new failures use updated config

### Q: What happens if I disable retry after enabling it?

**A:** Setting `enableRetry: false`:
- Stops retry polling
- Existing failed messages remain in `failed` status
- New failures stay failed (no retry)
- Does NOT delete retry data from database

### Q: How do I manually retry a permanently failed message?

```sql
-- Reset retry counter
UPDATE inbox_messages
SET
  status = 'failed',
  retry_count = 0,
  scheduled_at = NULL
WHERE id = 'message-id-here';
```

Next retry poll will pick it up (if `enableRetry: true`).

---

## Support

### Getting Help

- **GitHub Issues**: [Event-Forge Issues](https://github.com/event-forge/inbox-outbox/issues)
- **GitHub Discussions**: [Event-Forge Discussions](https://github.com/event-forge/inbox-outbox/discussions)
- **Documentation**: [Event-Forge Docs](https://event-forge.dev)

### Reporting Issues

Include:
- Event-Forge version (before and after)
- Database type and version
- Error messages and stack traces
- Migration step where issue occurred
- Configuration used

---

## Summary

### Minimal Migration (No New Features)

**Time: ~15 minutes**

```bash
# 1. Update packages
npm install @prodforcode/event-forge-core@1.1.0 \
            @prodforcode/event-forge-nestjs@1.1.0 \
            @prodforcode/event-forge-typeorm@1.1.0 \
            @prodforcode/event-forge-rabbitmq@1.1.0

# 2. Run migrations
npx event-forge migration:run --data-source=./src/config/data-source.ts

# 3. Test application
npm test

# Done! OUTBOX backoff is automatically improved
```

### Full Migration (All New Features)

**Time: ~1 hour**

1. Update packages ✅
2. Run database migrations ✅
3. Enable INBOX retry in config ✅
4. Install RabbitMQ Consumer package ✅
5. Migrate handlers to `@InboxSubscribe` ✅
6. Test all features thoroughly ✅

---

**Congratulations!** You've successfully migrated to Event-Forge v1.1.0 🎉
