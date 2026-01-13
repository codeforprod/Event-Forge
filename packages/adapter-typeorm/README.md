# @prodforcode/event-forge-typeorm

TypeORM adapter for Event-Forge - Universal Inbox-Outbox Pattern implementation for PostgreSQL.

## Installation

```bash
npm install @prodforcode/event-forge-typeorm typeorm
```

## Features

- ✅ PostgreSQL 12+ compatible
- ✅ TypeORM entity definitions for outbox and inbox messages
- ✅ Optimized repository implementations with SELECT FOR UPDATE SKIP LOCKED
- ✅ Automatic database migration generation
- ✅ CLI tool for migration management
- ✅ **Migration versioning and tracking system**
- ✅ **Automatic migration discovery and execution**
- ✅ Full TypeScript support

## Quick Start

### 1. Generate Database Migration

Event-Forge provides a CLI tool to generate database migrations without requiring an active TypeORM connection.

#### Generate SQL to stdout

```bash
npx event-forge migration:generate
```

#### Generate SQL file

```bash
npx event-forge migration:generate --format=sql --output=./migrations
```

#### Generate TypeORM migration class

```bash
npx event-forge migration:generate --format=typeorm --output=./migrations
```

#### Custom table names and schema

```bash
npx event-forge migration:generate \
  --format=sql \
  --output=./migrations \
  --schema=messaging \
  --outbox-table=my_outbox \
  --inbox-table=my_inbox
```

### 2. Apply Migration

After generating the migration, apply it to your database:

#### Using raw SQL

```bash
psql -d your_database -f migrations/20260109-event-forge-migration.sql
```

#### Using TypeORM migrations

```bash
npm run typeorm migration:run
```

### 3. Use in Your Application

```typescript
import { DataSource } from 'typeorm';
import {
  OutboxMessageEntity,
  InboxMessageEntity,
  TypeORMOutboxRepository,
  TypeORMInboxRepository,
} from '@prodforcode/event-forge-typeorm';
import { OutboxService, InboxService } from '@prodforcode/event-forge-core';

// Initialize TypeORM DataSource
const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'postgres',
  database: 'myapp',
  entities: [OutboxMessageEntity, InboxMessageEntity],
  synchronize: false, // Use migrations instead
});

await dataSource.initialize();

// Create repositories
const outboxRepo = new TypeORMOutboxRepository(
  dataSource.getRepository(OutboxMessageEntity),
);

const inboxRepo = new TypeORMInboxRepository(
  dataSource.getRepository(InboxMessageEntity),
);

// Create services
const outboxService = new OutboxService(outboxRepo, publisher);
const inboxService = new InboxService(inboxRepo);

// Use in your business logic
await dataSource.transaction(async (manager) => {
  // Your business logic here
  await manager.save(order);

  // Create outbox message within same transaction
  await outboxService.createMessage(
    {
      aggregateType: 'Order',
      aggregateId: order.id,
      eventType: 'OrderCreated',
      payload: { orderId: order.id, amount: order.total },
    },
    manager, // Pass transaction manager for transactional outbox
  );
});
```

## Programmatic Migration Generation

You can also generate migrations programmatically:

```typescript
import {
  getEventForgeUpSQL,
  getEventForgeDownSQL,
  generateMigrationClass,
  generateRawSQLFile,
} from '@prodforcode/event-forge-typeorm';

// Generate UP migration SQL
const upSQL = getEventForgeUpSQL({
  schema: 'messaging',
  outboxTable: 'outbox_messages',
  inboxTable: 'inbox_messages',
});

// Generate DOWN migration SQL
const downSQL = getEventForgeDownSQL({
  schema: 'messaging',
  outboxTable: 'outbox_messages',
  inboxTable: 'inbox_messages',
});

// Generate TypeORM migration class
const migrationClass = generateMigrationClass({
  schema: 'messaging',
});

// Generate complete SQL file with comments
const sqlFile = generateRawSQLFile({
  schema: 'messaging',
});

// Write to file
import * as fs from 'fs';
fs.writeFileSync('migration.sql', sqlFile);
```

## Migration Versioning System

Event-Forge includes a comprehensive migration management system that tracks applied migrations and automatically discovers pending ones when upgrading between versions.

See [MIGRATIONS.md](./MIGRATIONS.md) for complete documentation.

### Quick Overview

When upgrading Event-Forge (e.g., 1.0.5 → 1.0.6), the migration system:

1. Tracks which migrations have been applied
2. Discovers new migrations from the package
3. Runs pending migrations automatically or on-demand
4. Supports rollback if needed

### Usage

```bash
# List all migrations with status
npx event-forge migration:list --data-source=./src/data-source.ts

# Run pending migrations
npx event-forge migration:run --data-source=./src/data-source.ts

# Rollback last migration
npx event-forge migration:rollback --data-source=./src/data-source.ts
```

## CLI Reference

### `event-forge migration:generate`

Generate Event-Forge database migration for NEW projects.

**Options:**

- `-f, --format <format>` - Output format: `sql`, `typeorm`, or `stdout` (default: `stdout`)
- `-o, --output <dir>` - Output directory (required for sql/typeorm formats)
- `--filename <name>` - Custom output filename (optional)
- `--schema <name>` - Database schema name (default: `public`)
- `--outbox-table <name>` - Outbox table name (default: `outbox_messages`)
- `--inbox-table <name>` - Inbox table name (default: `inbox_messages`)

**Examples:**

```bash
# Generate to stdout
npx event-forge migration:generate

# Generate SQL file with custom options
npx event-forge migration:generate \
  --format=sql \
  --output=./migrations \
  --schema=events \
  --outbox-table=event_outbox

# Generate TypeORM migration class
npx event-forge migration:generate \
  --format=typeorm \
  --output=./src/migrations \
  --filename=1704657600000-EventForge.ts
```

### `event-forge migration:list`

List all Event-Forge migrations with their status.

**Options:**

- `-d, --data-source <path>` - Path to TypeORM DataSource configuration file (required)
- `-m, --migrations-path <path>` - Custom migrations directory path (optional)

**Example:**

```bash
npx event-forge migration:list --data-source=./src/data-source.ts
```

### `event-forge migration:run`

Run pending Event-Forge migrations.

**Options:**

- `-d, --data-source <path>` - Path to TypeORM DataSource configuration file (required)
- `-m, --migrations-path <path>` - Custom migrations directory path (optional)

**Example:**

```bash
npx event-forge migration:run --data-source=./src/data-source.ts
```

### `event-forge migration:rollback`

Rollback Event-Forge migrations.

**Options:**

- `-d, --data-source <path>` - Path to TypeORM DataSource configuration file (required)
- `-m, --migrations-path <path>` - Custom migrations directory path (optional)
- `-c, --count <number>` - Number of migrations to rollback (default: 1)

**Examples:**

```bash
# Rollback last migration
npx event-forge migration:rollback --data-source=./src/data-source.ts

# Rollback last 2 migrations
npx event-forge migration:rollback --data-source=./src/data-source.ts --count=2
```

## Database Schema

### Outbox Messages Table

```sql
CREATE TABLE outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  status outbox_message_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_message TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  locked_by VARCHAR(255),
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

**Indexes:**

- Partial index on `(status, scheduled_at, created_at)` for pending/failed messages
- Index on `(aggregate_type, aggregate_id)` for aggregate lookups
- Index on `(event_type)` for event type filtering
- Index on `(created_at)` for time-based queries

### Inbox Messages Table

```sql
CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status inbox_message_status NOT NULL DEFAULT 'received',
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, source)
);
```

**Indexes:**

- Unique constraint on `(message_id, source)` for deduplication
- Index on `(event_type)` for event type filtering
- Index on `(status)` for status filtering
- Index on `(created_at)` for time-based queries
- Index on `(received_at)` for received time queries

## API Reference

### Migration Generation Functions

#### `getEventForgeUpSQL(options?): string`

Generates complete UP migration SQL (CREATE statements).

**Parameters:**

- `options.schema` - Database schema name (default: `'public'`)
- `options.outboxTable` - Outbox table name (default: `'outbox_messages'`)
- `options.inboxTable` - Inbox table name (default: `'inbox_messages'`)

**Returns:** SQL string with CREATE statements for types, tables, and indexes

#### `getEventForgeDownSQL(options?): string`

Generates complete DOWN migration SQL (DROP statements).

**Parameters:** Same as `getEventForgeUpSQL`

**Returns:** SQL string with DROP statements for tables and types

#### `generateMigrationClass(options?): string`

Generates TypeORM migration class file content.

**Parameters:** Same as `getEventForgeUpSQL`

**Returns:** TypeScript code for TypeORM migration class

#### `generateRawSQLFile(options?): string`

Generates raw SQL file content with both UP and DOWN migrations.

**Parameters:** Same as `getEventForgeUpSQL`

**Returns:** SQL string with commented sections for UP and DOWN migrations

## Requirements

- PostgreSQL 12 or higher
- TypeORM 0.3.0 or higher
- Node.js 18 or higher

## License

MIT

## Related Packages

- [@prodforcode/event-forge-core](../core) - Core interfaces and services
- [@prodforcode/event-forge-mongoose](../adapter-mongoose) - MongoDB adapter
- [@prodforcode/event-forge-rabbitmq](../publisher-rabbitmq) - RabbitMQ publisher
- [@prodforcode/event-forge-nestjs](../nestjs) - NestJS integration

## Support

For issues and questions, please visit [GitHub Issues](https://github.com/your-org/event-forge/issues).
