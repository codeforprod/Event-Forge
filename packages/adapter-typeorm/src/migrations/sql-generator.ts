/**
 * SQL Generator for Event-Forge Database Migrations
 *
 * Provides programmatic API for generating SQL migration scripts
 * for the Transactional Inbox-Outbox pattern.
 */

import {
  generateEnumTypes,
  generateOutboxTable,
  generateInboxTable,
  generateOutboxIndexes,
  generateInboxIndexes,
  generateDropTables,
  generateDropTypes,
  type MigrationOptions,
} from './templates';

/**
 * Generates complete UP migration SQL (CREATE statements)
 *
 * @param options - Migration customization options
 * @returns SQL string with CREATE statements for types, tables, and indexes
 *
 * @example
 * ```typescript
 * const sql = getEventForgeUpSQL({ schema: 'messaging' });
 * await connection.query(sql);
 * ```
 */
export function getEventForgeUpSQL(options: MigrationOptions = {}): string {
  const parts: string[] = [];

  // 1. Create ENUM types
  parts.push(generateEnumTypes(options));
  parts.push('');

  // 2. Create tables
  parts.push(generateOutboxTable(options));
  parts.push('');
  parts.push(generateInboxTable(options));
  parts.push('');

  // 3. Create indexes
  parts.push(generateOutboxIndexes(options));
  parts.push('');
  parts.push(generateInboxIndexes(options));

  return parts.join('\n');
}

/**
 * Generates complete DOWN migration SQL (DROP statements)
 *
 * @param options - Migration customization options
 * @returns SQL string with DROP statements for tables and types
 *
 * @example
 * ```typescript
 * const sql = getEventForgeDownSQL({ schema: 'messaging' });
 * await connection.query(sql);
 * ```
 */
export function getEventForgeDownSQL(options: MigrationOptions = {}): string {
  const parts: string[] = [];

  // 1. Drop tables (must drop before types due to dependencies)
  parts.push(generateDropTables(options));
  parts.push('');

  // 2. Drop ENUM types
  parts.push(generateDropTypes(options));

  return parts.join('\n');
}

/**
 * Generates TypeORM migration class file content
 *
 * @param options - Migration customization options
 * @returns TypeScript code for TypeORM migration class
 *
 * @example
 * ```typescript
 * const migrationClass = generateMigrationClass({ schema: 'messaging' });
 * fs.writeFileSync('migrations/1234567890-EventForge.ts', migrationClass);
 * ```
 */
export function generateMigrationClass(options: MigrationOptions = {}): string {
  const now = new Date();
  const timestamp = now.getTime();
  const className = `EventForgeMigration${timestamp}`;

  const upSQL = getEventForgeUpSQL(options)
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');

  const downSQL = getEventForgeDownSQL(options)
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');

  return `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Event-Forge Migration: Creates outbox_messages and inbox_messages tables
 * Generated on: ${now.toISOString()}
 */
export class ${className} implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`
${upSQL}
    \`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`
${downSQL}
    \`);
  }
}
`;
}

/**
 * Generates raw SQL file content with both UP and DOWN migrations
 *
 * @param options - Migration customization options
 * @returns SQL string with commented sections for UP and DOWN
 */
export function generateRawSQLFile(options: MigrationOptions = {}): string {
  const upSQL = getEventForgeUpSQL(options);
  const downSQL = getEventForgeDownSQL(options);

  return `-- Event-Forge Database Migration
-- Generated on: ${new Date().toISOString()}
--
-- This migration creates the tables required for the
-- Transactional Inbox-Outbox pattern implementation.

-- ============================================================
-- UP MIGRATION (Apply Changes)
-- ============================================================

${upSQL}

-- ============================================================
-- DOWN MIGRATION (Rollback Changes)
-- ============================================================
-- Uncomment the following to rollback the migration:

/*
${downSQL}
*/
`;
}
