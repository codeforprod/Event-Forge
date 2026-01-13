# Event-Forge Migration System

The Event-Forge migration system provides automatic database schema management for upgrading between versions.

## Overview

When upgrading Event-Forge from one version to another (e.g., 1.0.5 → 1.0.6), new database fields or schema changes may be required. The migration system handles this automatically.

## Features

- **Automatic migration tracking** - Tracks which migrations have been applied
- **Version-based migrations** - Migrations are versioned using semantic versioning
- **CLI commands** - List, run, and rollback migrations from the command line
- **Transactional execution** - Each migration runs in a transaction for safety
- **Rollback support** - Undo migrations if needed

## Migration File Format

Migrations use semantic versioning with sequence numbers:

```
{major}.{minor}.{patch}-{sequence}
```

Examples:
- `1.0.6-001` - First migration in version 1.0.6
- `1.0.6-002` - Second migration in version 1.0.6
- `1.1.0-001` - First migration in version 1.1.0

## Usage

### For New Projects

When installing Event-Forge for the first time, generate the initial tables:

```bash
npx event-forge migration:generate \
  --format=typeorm \
  --output=./src/migrations
```

This creates tables with all fields included - no migrations needed.

### For Existing Projects (Upgrading)

When upgrading Event-Forge to a new version:

#### 1. List Available Migrations

```bash
npx event-forge migration:list \
  --data-source=./src/data-source.ts
```

Output:
```
📋 Found 2 migration(s):

   Applied: 1
   Pending: 1

Status | Version       | Name
-------|---------------|------------------------------
✅     | 1.0.5-001     | InitialSchema (2025-01-10T10:00:00.000Z)
⏳     | 1.0.6-001     | AddInboxRetryFields
```

#### 2. Run Pending Migrations

```bash
npx event-forge migration:run \
  --data-source=./src/data-source.ts
```

Output:
```
🔍 Discovering pending migrations...
📋 Found 1 pending migration(s):

   - 1.0.6-001 AddInboxRetryFields

🚀 Running migrations...

📊 Migration Results:

   ✅ 1.0.6-001 AddInboxRetryFields (125ms)

✅ All migrations completed successfully
```

#### 3. Rollback Migrations (if needed)

```bash
# Rollback last migration
npx event-forge migration:rollback \
  --data-source=./src/data-source.ts

# Rollback last 2 migrations
npx event-forge migration:rollback \
  --data-source=./src/data-source.ts \
  --count=2
```

## DataSource Configuration

All migration commands require a `--data-source` parameter pointing to a TypeORM DataSource configuration file:

```typescript
// src/data-source.ts
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'myuser',
  password: 'mypassword',
  database: 'mydb',
  entities: ['src/entities/**/*.entity.ts'],
  synchronize: false,
});

export default AppDataSource;
```

## Writing Custom Migrations

To create a custom migration for your application:

### 1. Create Migration File

Create a file following the naming convention:

```
{major}.{minor}.{patch}-{seq}-{name}.ts
```

Example: `1.0.7-001-AddUserStatus.ts`

### 2. Implement Migration Interface

```typescript
import { DataSource } from 'typeorm';
import { Migration } from '@prodforcode/event-forge-typeorm';

export const migration: Migration = {
  version: '1.0.7-001',
  name: 'AddUserStatus',

  async up(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      ALTER TABLE users
      ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active';
    `);

    await dataSource.query(`
      CREATE INDEX idx_users_status ON users (status);
    `);
  },

  async down(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      DROP INDEX IF EXISTS idx_users_status;
    `);

    await dataSource.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS status;
    `);
  },
};
```

### 3. Place in Custom Directory

Store custom migrations in your application:

```
src/
└── migrations/
    └── 1.0.7-001-AddUserStatus.ts
```

### 4. Run Custom Migrations

```bash
npx event-forge migration:run \
  --data-source=./src/data-source.ts \
  --migrations-path=./src/migrations
```

## Programmatic Usage

Use the migration system programmatically in your application:

```typescript
import { DataSource } from 'typeorm';
import { MigrationManager } from '@prodforcode/event-forge-typeorm';

async function runMigrations() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'myuser',
    password: 'mypassword',
    database: 'mydb',
  });

  await dataSource.initialize();

  const manager = new MigrationManager(dataSource);

  // List migrations
  const migrations = await manager.listMigrations();
  console.log('Migrations:', migrations);

  // Run pending migrations
  const results = await manager.runPendingMigrations();
  console.log('Results:', results);

  // Rollback last migration
  const rollbackResults = await manager.rollback(1);
  console.log('Rollback:', rollbackResults);

  await dataSource.destroy();
}
```

## Migration Tracking Table

The system automatically creates a tracking table:

```sql
CREATE TABLE event_forge_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

This table records which migrations have been applied and when.

## Best Practices

### 1. Version Naming

Use semantic versioning:
- **Major** version: Breaking changes
- **Minor** version: New features (backward compatible)
- **Patch** version: Bug fixes
- **Sequence**: Migration order within version

### 2. Idempotent Migrations

Always use `IF EXISTS` or `IF NOT EXISTS`:

```sql
-- Good
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Bad
ALTER TABLE users ADD COLUMN email VARCHAR(255);
```

### 3. Test Rollbacks

Always implement and test the `down()` method:

```typescript
async down(dataSource: DataSource): Promise<void> {
  // Undo changes made in up()
  await dataSource.query('DROP INDEX IF EXISTS idx_users_email');
  await dataSource.query('ALTER TABLE users DROP COLUMN IF EXISTS email');
}
```

### 4. Backup Before Migration

Always backup your database before running migrations in production:

```bash
# PostgreSQL example
pg_dump mydb > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 5. Test in Staging First

Run migrations in a staging environment before production:

```bash
# Staging
npx event-forge migration:run --data-source=./data-source.staging.ts

# Verify application works

# Production
npx event-forge migration:run --data-source=./data-source.prod.ts
```

## Troubleshooting

### Migration Fails

If a migration fails:

1. Check the error message in the output
2. Fix the migration file
3. Rollback if needed: `npx event-forge migration:rollback`
4. Run again: `npx event-forge migration:run`

### Migration Already Applied

If you see "migration already applied" but it's not in your database:

```bash
# Manually insert into tracking table
INSERT INTO event_forge_migrations (version, name)
VALUES ('1.0.6-001', 'AddInboxRetryFields');
```

### Migration Not Discovered

Ensure your migration file:
1. Follows naming convention: `{version}-{name}.ts`
2. Exports `migration` object implementing `Migration` interface
3. Is in the correct directory

## Migration Execution Flow

```
1. List pending migrations
   ↓
2. Sort by version (semantic versioning)
   ↓
3. For each pending migration:
   - Start transaction
   - Execute up() method
   - Record in tracking table
   - Commit transaction
   ↓
4. Report results
```

## Security Considerations

1. **Backup first** - Always backup before running migrations
2. **Test locally** - Test migrations in development environment
3. **Use transactions** - All migrations run in transactions
4. **Rollback plan** - Have a rollback plan for production
5. **Access control** - Restrict migration execution to authorized users

## Support

For issues or questions:
- GitHub Issues: https://github.com/prodforcode/event-forge/issues
- Documentation: https://event-forge.dev/docs
