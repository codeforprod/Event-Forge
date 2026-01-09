/**
 * Unit Tests for SQL Generator
 *
 * Tests for Event-Forge migration generation functions
 */

import {
  getEventForgeUpSQL,
  getEventForgeDownSQL,
  generateMigrationClass,
  generateRawSQLFile,
} from '../sql-generator';
import {
  generateEnumTypes,
  generateOutboxTable,
  generateInboxTable,
  generateOutboxIndexes,
  generateInboxIndexes,
  generateDropTables,
  generateDropTypes,
} from '../templates';

describe('SQL Templates', () => {
  describe('generateEnumTypes', () => {
    it('should generate ENUM types with default schema', () => {
      const sql = generateEnumTypes();

      expect(sql).toContain('CREATE TYPE outbox_message_status');
      expect(sql).toContain('CREATE TYPE inbox_message_status');
      expect(sql).toContain("'pending'");
      expect(sql).toContain("'processing'");
      expect(sql).toContain("'published'");
      expect(sql).toContain("'failed'");
      expect(sql).toContain("'permanently_failed'");
      expect(sql).toContain("'received'");
      expect(sql).toContain("'processed'");
      expect(sql).not.toContain('public.');
    });

    it('should generate ENUM types with custom schema', () => {
      const sql = generateEnumTypes({ schema: 'messaging' });

      expect(sql).toContain('CREATE TYPE messaging.outbox_message_status');
      expect(sql).toContain('CREATE TYPE messaging.inbox_message_status');
    });
  });

  describe('generateOutboxTable', () => {
    it('should generate outbox_messages table with all required columns', () => {
      const sql = generateOutboxTable();

      // Table name
      expect(sql).toContain('CREATE TABLE outbox_messages');

      // Primary key
      expect(sql).toContain('id UUID PRIMARY KEY');
      expect(sql).toContain('gen_random_uuid()');

      // Required columns
      expect(sql).toContain('aggregate_type VARCHAR(255) NOT NULL');
      expect(sql).toContain('aggregate_id VARCHAR(255) NOT NULL');
      expect(sql).toContain('event_type VARCHAR(255) NOT NULL');
      expect(sql).toContain('payload JSONB NOT NULL');
      expect(sql).toContain('metadata JSONB');

      // Status column with ENUM type
      expect(sql).toContain('status outbox_message_status NOT NULL');
      expect(sql).toContain("DEFAULT 'pending'");

      // Retry columns
      expect(sql).toContain('retry_count INTEGER NOT NULL DEFAULT 0');
      expect(sql).toContain('max_retries INTEGER NOT NULL DEFAULT 5');

      // Error handling
      expect(sql).toContain('error_message TEXT');

      // Scheduling
      expect(sql).toContain('scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL');

      // Locking
      expect(sql).toContain('locked_by VARCHAR(255)');
      expect(sql).toContain('locked_at TIMESTAMP WITH TIME ZONE');

      // Timestamps
      expect(sql).toContain('created_at TIMESTAMP WITH TIME ZONE NOT NULL');
      expect(sql).toContain('updated_at TIMESTAMP WITH TIME ZONE NOT NULL');
    });

    it('should generate outbox table with custom name', () => {
      const sql = generateOutboxTable({ outboxTable: 'custom_outbox' });

      expect(sql).toContain('CREATE TABLE custom_outbox');
    });

    it('should generate outbox table with custom schema', () => {
      const sql = generateOutboxTable({ schema: 'messaging' });

      expect(sql).toContain('CREATE TABLE messaging.outbox_messages');
      expect(sql).toContain('status messaging.outbox_message_status');
    });
  });

  describe('generateInboxTable', () => {
    it('should generate inbox_messages table with all required columns', () => {
      const sql = generateInboxTable();

      // Table name
      expect(sql).toContain('CREATE TABLE inbox_messages');

      // Primary key
      expect(sql).toContain('id UUID PRIMARY KEY');

      // Deduplication columns
      expect(sql).toContain('message_id VARCHAR(255) NOT NULL');
      expect(sql).toContain('source VARCHAR(255) NOT NULL');
      expect(sql).toContain('UNIQUE(message_id, source)');

      // Event data
      expect(sql).toContain('event_type VARCHAR(255) NOT NULL');
      expect(sql).toContain('payload JSONB NOT NULL');

      // Status
      expect(sql).toContain('status inbox_message_status NOT NULL');
      expect(sql).toContain("DEFAULT 'received'");

      // Processing
      expect(sql).toContain('processed_at TIMESTAMP WITH TIME ZONE');
      expect(sql).toContain('error_message TEXT');

      // Timestamps
      expect(sql).toContain('created_at TIMESTAMP WITH TIME ZONE NOT NULL');
      expect(sql).toContain('received_at TIMESTAMP WITH TIME ZONE NOT NULL');
    });

    it('should generate inbox table with custom name', () => {
      const sql = generateInboxTable({ inboxTable: 'custom_inbox' });

      expect(sql).toContain('CREATE TABLE custom_inbox');
    });

    it('should generate inbox table with custom schema', () => {
      const sql = generateInboxTable({ schema: 'messaging' });

      expect(sql).toContain('CREATE TABLE messaging.inbox_messages');
      expect(sql).toContain('status messaging.inbox_message_status');
    });
  });

  describe('generateOutboxIndexes', () => {
    it('should generate all required outbox indexes', () => {
      const sql = generateOutboxIndexes();

      // Partial index for pending/failed
      expect(sql).toContain('CREATE INDEX idx_outbox_pending');
      expect(sql).toContain('(status, scheduled_at, created_at)');
      expect(sql).toContain("WHERE status IN ('pending', 'failed')");

      // Aggregate index
      expect(sql).toContain('CREATE INDEX idx_outbox_aggregate');
      expect(sql).toContain('(aggregate_type, aggregate_id)');

      // Event type index
      expect(sql).toContain('CREATE INDEX idx_outbox_event_type');
      expect(sql).toContain('(event_type)');

      // Created at index
      expect(sql).toContain('CREATE INDEX idx_outbox_created_at');
      expect(sql).toContain('(created_at)');
    });

    it('should generate indexes with custom table name', () => {
      const sql = generateOutboxIndexes({ outboxTable: 'custom_outbox' });

      expect(sql).toContain('ON custom_outbox');
    });

    it('should generate indexes with custom schema', () => {
      const sql = generateOutboxIndexes({ schema: 'messaging' });

      expect(sql).toContain('ON messaging.outbox_messages');
    });
  });

  describe('generateInboxIndexes', () => {
    it('should generate all required inbox indexes', () => {
      const sql = generateInboxIndexes();

      // Event type index
      expect(sql).toContain('CREATE INDEX idx_inbox_event_type');
      expect(sql).toContain('(event_type)');

      // Status index
      expect(sql).toContain('CREATE INDEX idx_inbox_status');
      expect(sql).toContain('(status)');

      // Created at index
      expect(sql).toContain('CREATE INDEX idx_inbox_created_at');
      expect(sql).toContain('(created_at)');

      // Received at index
      expect(sql).toContain('CREATE INDEX idx_inbox_received_at');
      expect(sql).toContain('(received_at)');
    });

    it('should generate indexes with custom table name', () => {
      const sql = generateInboxIndexes({ inboxTable: 'custom_inbox' });

      expect(sql).toContain('ON custom_inbox');
    });
  });

  describe('generateDropTables', () => {
    it('should generate DROP TABLE statements', () => {
      const sql = generateDropTables();

      expect(sql).toContain('DROP TABLE IF EXISTS outbox_messages');
      expect(sql).toContain('DROP TABLE IF EXISTS inbox_messages');
    });

    it('should handle custom table names', () => {
      const sql = generateDropTables({
        outboxTable: 'custom_outbox',
        inboxTable: 'custom_inbox',
      });

      expect(sql).toContain('DROP TABLE IF EXISTS custom_outbox');
      expect(sql).toContain('DROP TABLE IF EXISTS custom_inbox');
    });

    it('should handle custom schema', () => {
      const sql = generateDropTables({ schema: 'messaging' });

      expect(sql).toContain('DROP TABLE IF EXISTS messaging.outbox_messages');
      expect(sql).toContain('DROP TABLE IF EXISTS messaging.inbox_messages');
    });
  });

  describe('generateDropTypes', () => {
    it('should generate DROP TYPE statements', () => {
      const sql = generateDropTypes();

      expect(sql).toContain('DROP TYPE IF EXISTS outbox_message_status');
      expect(sql).toContain('DROP TYPE IF EXISTS inbox_message_status');
    });

    it('should handle custom schema', () => {
      const sql = generateDropTypes({ schema: 'messaging' });

      expect(sql).toContain('DROP TYPE IF EXISTS messaging.outbox_message_status');
      expect(sql).toContain('DROP TYPE IF EXISTS messaging.inbox_message_status');
    });
  });
});

describe('SQL Generator', () => {
  describe('getEventForgeUpSQL', () => {
    it('should generate complete UP migration SQL', () => {
      const sql = getEventForgeUpSQL();

      // Should contain all components
      expect(sql).toContain('CREATE TYPE outbox_message_status');
      expect(sql).toContain('CREATE TYPE inbox_message_status');
      expect(sql).toContain('CREATE TABLE outbox_messages');
      expect(sql).toContain('CREATE TABLE inbox_messages');
      expect(sql).toContain('CREATE INDEX idx_outbox_pending');
      expect(sql).toContain('CREATE INDEX idx_inbox_event_type');
    });

    it('should work with custom options', () => {
      const sql = getEventForgeUpSQL({
        schema: 'messaging',
        outboxTable: 'my_outbox',
        inboxTable: 'my_inbox',
      });

      expect(sql).toContain('messaging.outbox_message_status');
      expect(sql).toContain('CREATE TABLE messaging.my_outbox');
      expect(sql).toContain('CREATE TABLE messaging.my_inbox');
    });

    it('should be valid SQL format', () => {
      const sql = getEventForgeUpSQL();

      // Should not have syntax errors (basic checks)
      expect(sql).not.toContain('undefined');
      expect(sql).not.toContain('null');
      expect(sql.split('CREATE TYPE').length).toBe(3); // 1 initial + 2 types
      expect(sql.split('CREATE TABLE').length).toBe(3); // 1 initial + 2 tables
    });
  });

  describe('getEventForgeDownSQL', () => {
    it('should generate complete DOWN migration SQL', () => {
      const sql = getEventForgeDownSQL();

      // Should drop tables before types
      expect(sql).toContain('DROP TABLE IF EXISTS outbox_messages');
      expect(sql).toContain('DROP TABLE IF EXISTS inbox_messages');
      expect(sql).toContain('DROP TYPE IF EXISTS outbox_message_status');
      expect(sql).toContain('DROP TYPE IF EXISTS inbox_message_status');

      // Check order: tables should appear before types
      const tablesIndex = sql.indexOf('DROP TABLE');
      const typesIndex = sql.indexOf('DROP TYPE');
      expect(tablesIndex).toBeLessThan(typesIndex);
    });

    it('should work with custom options', () => {
      const sql = getEventForgeDownSQL({
        schema: 'messaging',
        outboxTable: 'my_outbox',
        inboxTable: 'my_inbox',
      });

      expect(sql).toContain('messaging.my_outbox');
      expect(sql).toContain('messaging.my_inbox');
      expect(sql).toContain('messaging.outbox_message_status');
    });
  });

  describe('generateMigrationClass', () => {
    it('should generate valid TypeORM migration class', () => {
      const code = generateMigrationClass();

      // Class structure
      expect(code).toContain('import { MigrationInterface, QueryRunner }');
      expect(code).toContain('export class');
      expect(code).toContain('implements MigrationInterface');
      expect(code).toContain('public async up(queryRunner: QueryRunner)');
      expect(code).toContain('public async down(queryRunner: QueryRunner)');

      // Should contain SQL
      expect(code).toContain('CREATE TYPE outbox_message_status');
      expect(code).toContain('DROP TABLE IF EXISTS');
    });

    it('should include timestamp in class name', () => {
      const code1 = generateMigrationClass();
      const code2 = generateMigrationClass();

      // Extract class names
      const classNameMatch1 = code1.match(/export class (\w+)/);
      const classNameMatch2 = code2.match(/export class (\w+)/);

      expect(classNameMatch1).toBeTruthy();
      expect(classNameMatch2).toBeTruthy();

      // Names should start with EventForgeMigration
      expect(classNameMatch1![1]).toMatch(/^EventForgeMigration\d+$/);
      expect(classNameMatch2![1]).toMatch(/^EventForgeMigration\d+$/);
    });

    it('should work with custom options', () => {
      const code = generateMigrationClass({
        schema: 'messaging',
        outboxTable: 'my_outbox',
      });

      expect(code).toContain('messaging.my_outbox');
      expect(code).toContain('messaging.outbox_message_status');
    });

    it('should have proper indentation', () => {
      const code = generateMigrationClass();

      // Check that SQL is indented inside the template literal
      const lines = code.split('\n');
      const sqlLines = lines.filter((line) =>
        line.includes('CREATE TYPE') || line.includes('CREATE TABLE'),
      );

      // All SQL lines should have leading whitespace
      sqlLines.forEach((line) => {
        expect(line).toMatch(/^\s+/);
      });
    });
  });

  describe('generateRawSQLFile', () => {
    it('should generate complete SQL file with comments', () => {
      const sql = generateRawSQLFile();

      // Header comments
      expect(sql).toContain('Event-Forge Database Migration');
      expect(sql).toContain('Generated on:');
      expect(sql).toContain('Transactional Inbox-Outbox pattern');

      // Section headers
      expect(sql).toContain('UP MIGRATION');
      expect(sql).toContain('DOWN MIGRATION');

      // SQL content
      expect(sql).toContain('CREATE TYPE outbox_message_status');
      expect(sql).toContain('DROP TABLE IF EXISTS');

      // Down migration should be commented
      expect(sql).toContain('/*');
      expect(sql).toContain('*/');
    });

    it('should have proper structure', () => {
      const sql = generateRawSQLFile();

      // Check order of sections
      const upIndex = sql.indexOf('UP MIGRATION');
      const downIndex = sql.indexOf('DOWN MIGRATION');
      const createIndex = sql.indexOf('CREATE TYPE');
      const dropIndex = sql.indexOf('DROP TABLE');

      expect(upIndex).toBeGreaterThan(0);
      expect(downIndex).toBeGreaterThan(upIndex);
      expect(createIndex).toBeGreaterThan(upIndex);
      expect(createIndex).toBeLessThan(downIndex);
      expect(dropIndex).toBeGreaterThan(downIndex);
    });

    it('should work with custom options', () => {
      const sql = generateRawSQLFile({
        schema: 'messaging',
        outboxTable: 'my_outbox',
        inboxTable: 'my_inbox',
      });

      expect(sql).toContain('messaging.my_outbox');
      expect(sql).toContain('messaging.my_inbox');
    });
  });
});

describe('Integration Tests', () => {
  it('should generate consistent SQL across all functions', () => {
    const options = {
      schema: 'test_schema',
      outboxTable: 'test_outbox',
      inboxTable: 'test_inbox',
    };

    const upSQL = getEventForgeUpSQL(options);
    const downSQL = getEventForgeDownSQL(options);
    const classCode = generateMigrationClass(options);
    const rawFile = generateRawSQLFile(options);

    // All should reference the same schema
    [upSQL, downSQL, classCode, rawFile].forEach((content) => {
      expect(content).toContain('test_schema');
      expect(content).toContain('test_outbox');
      expect(content).toContain('test_inbox');
    });
  });

  it('should handle edge cases', () => {
    // Empty options should use defaults
    const defaultSQL = getEventForgeUpSQL({});
    expect(defaultSQL).toContain('outbox_messages');
    expect(defaultSQL).toContain('inbox_messages');
    expect(defaultSQL).not.toContain('public.');

    // Undefined options should use defaults
    const undefinedSQL = getEventForgeUpSQL(undefined);
    expect(undefinedSQL).toContain('outbox_messages');
  });
});
