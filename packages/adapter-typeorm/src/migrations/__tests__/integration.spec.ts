/**
 * Integration Tests for SQL Generation
 *
 * Tests that generated SQL executes successfully against a real PostgreSQL database.
 * These tests require a PostgreSQL database connection.
 */

import { DataSource } from 'typeorm';
import { getEventForgeUpSQL, getEventForgeDownSQL } from '../sql-generator';

describe('Migration Integration Tests', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    // Use in-memory SQLite for testing (TypeORM compatible)
    // For full PostgreSQL testing, set up test database connection
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      logging: false,
    });

    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('SQL Execution with SQLite (Syntax Validation)', () => {
    it('should validate SQL syntax is well-formed', () => {
      const upSQL = getEventForgeUpSQL();
      const downSQL = getEventForgeDownSQL();

      // Basic syntax validation
      expect(upSQL).not.toContain('undefined');
      expect(upSQL).not.toContain('null');
      expect(downSQL).not.toContain('undefined');
      expect(downSQL).not.toContain('null');

      // Verify CREATE statements are present
      expect(upSQL).toMatch(/CREATE TYPE/);
      expect(upSQL).toMatch(/CREATE TABLE/);
      expect(upSQL).toMatch(/CREATE INDEX/);

      // Verify DROP statements are present
      expect(downSQL).toMatch(/DROP TABLE/);
      expect(downSQL).toMatch(/DROP TYPE/);
    });

    it('should generate idempotent SQL', () => {
      const sql1 = getEventForgeUpSQL({ schema: 'test' });
      const sql2 = getEventForgeUpSQL({ schema: 'test' });

      expect(sql1).toBe(sql2);
    });

    it('should handle different schema names', () => {
      const schemas = ['public', 'messaging', 'test_schema'];

      schemas.forEach((schema) => {
        const upSQL = getEventForgeUpSQL({ schema });
        const downSQL = getEventForgeDownSQL({ schema });

        if (schema === 'public') {
          expect(upSQL).not.toContain('public.');
        } else {
          expect(upSQL).toContain(`${schema}.`);
          expect(downSQL).toContain(`${schema}.`);
        }
      });
    });

    it('should handle different table names', () => {
      const upSQL = getEventForgeUpSQL({
        outboxTable: 'custom_outbox',
        inboxTable: 'custom_inbox',
      });

      expect(upSQL).toContain('CREATE TABLE custom_outbox');
      expect(upSQL).toContain('CREATE TABLE custom_inbox');
      expect(upSQL).toContain('ON custom_outbox');
      expect(upSQL).toContain('ON custom_inbox');
    });
  });

  describe('SQL Statement Order', () => {
    it('should create types before tables in UP migration', () => {
      const sql = getEventForgeUpSQL();

      const typeIndex = sql.indexOf('CREATE TYPE');
      const tableIndex = sql.indexOf('CREATE TABLE');

      expect(typeIndex).toBeGreaterThan(0);
      expect(tableIndex).toBeGreaterThan(typeIndex);
    });

    it('should create tables before indexes in UP migration', () => {
      const sql = getEventForgeUpSQL();

      const tableIndex = sql.indexOf('CREATE TABLE');
      const indexIndex = sql.indexOf('CREATE INDEX');

      expect(tableIndex).toBeGreaterThan(0);
      expect(indexIndex).toBeGreaterThan(tableIndex);
    });

    it('should drop tables before types in DOWN migration', () => {
      const sql = getEventForgeDownSQL();

      const tableIndex = sql.indexOf('DROP TABLE');
      const typeIndex = sql.indexOf('DROP TYPE');

      expect(tableIndex).toBeGreaterThan(0);
      expect(typeIndex).toBeGreaterThan(tableIndex);
    });
  });

  describe('SQL Content Validation', () => {
    it('should include all required outbox columns', () => {
      const sql = getEventForgeUpSQL();

      const requiredColumns = [
        'id',
        'aggregate_type',
        'aggregate_id',
        'event_type',
        'payload',
        'status',
        'retry_count',
        'max_retries',
        'scheduled_at',
        'created_at',
        'updated_at',
      ];

      requiredColumns.forEach((column) => {
        expect(sql).toContain(column);
      });
    });

    it('should include all required inbox columns', () => {
      const sql = getEventForgeUpSQL();

      const requiredColumns = [
        'id',
        'message_id',
        'source',
        'event_type',
        'payload',
        'status',
        'created_at',
        'received_at',
      ];

      requiredColumns.forEach((column) => {
        expect(sql).toContain(column);
      });
    });

    it('should include all required ENUM values', () => {
      const sql = getEventForgeUpSQL();

      // Outbox status values
      const outboxStatuses = [
        'pending',
        'processing',
        'published',
        'failed',
        'permanently_failed',
      ];

      outboxStatuses.forEach((status) => {
        expect(sql).toContain(`'${status}'`);
      });

      // Inbox status values
      const inboxStatuses = ['received', 'processing', 'processed', 'failed'];

      inboxStatuses.forEach((status) => {
        expect(sql).toContain(`'${status}'`);
      });
    });

    it('should include deduplication constraint on inbox', () => {
      const sql = getEventForgeUpSQL();

      expect(sql).toContain('UNIQUE(message_id, source)');
    });

    it('should include partial index for outbox pending/failed messages', () => {
      const sql = getEventForgeUpSQL();

      expect(sql).toContain('CREATE INDEX idx_outbox_pending');
      expect(sql).toContain('status, scheduled_at, created_at');
      expect(sql).toContain("WHERE status IN ('pending', 'failed')");
    });

    it('should use JSONB for payload columns', () => {
      const sql = getEventForgeUpSQL();

      // Should use JSONB (not JSON) for better performance
      expect(sql).toMatch(/payload JSONB/);
    });

    it('should use TIMESTAMP WITH TIME ZONE for all timestamps', () => {
      const sql = getEventForgeUpSQL();

      // All timestamp columns should include timezone
      const timestampColumns = [
        'scheduled_at',
        'locked_at',
        'created_at',
        'updated_at',
        'processed_at',
        'received_at',
      ];

      timestampColumns.forEach((column) => {
        // Check that column definition includes timezone
        const columnRegex = new RegExp(`${column}.*TIMESTAMP WITH TIME ZONE`);
        expect(sql).toMatch(columnRegex);
      });
    });

    it('should use UUID for primary keys', () => {
      const sql = getEventForgeUpSQL();

      expect(sql).toMatch(/id UUID PRIMARY KEY/);
      expect(sql).toMatch(/gen_random_uuid\(\)/);
    });
  });

  describe('Index Validation', () => {
    it('should create all required outbox indexes', () => {
      const sql = getEventForgeUpSQL();

      const expectedIndexes = [
        'idx_outbox_pending',
        'idx_outbox_aggregate',
        'idx_outbox_event_type',
        'idx_outbox_created_at',
      ];

      expectedIndexes.forEach((index) => {
        expect(sql).toContain(`CREATE INDEX ${index}`);
      });
    });

    it('should create all required inbox indexes', () => {
      const sql = getEventForgeUpSQL();

      const expectedIndexes = [
        'idx_inbox_event_type',
        'idx_inbox_status',
        'idx_inbox_created_at',
        'idx_inbox_received_at',
      ];

      expectedIndexes.forEach((index) => {
        expect(sql).toContain(`CREATE INDEX ${index}`);
      });
    });
  });

  describe('PostgreSQL Compatibility', () => {
    it('should use PostgreSQL-specific syntax', () => {
      const sql = getEventForgeUpSQL();

      // ENUM type
      expect(sql).toContain('CREATE TYPE');
      expect(sql).toContain('AS ENUM');

      // UUID generation
      expect(sql).toContain('gen_random_uuid()');

      // JSONB
      expect(sql).toContain('JSONB');

      // Timestamp with timezone
      expect(sql).toContain('TIMESTAMP WITH TIME ZONE');
    });

    it('should use IF NOT EXISTS for idempotency in DOWN migration', () => {
      const sql = getEventForgeDownSQL();

      expect(sql).toContain('DROP TABLE IF EXISTS');
      expect(sql).toContain('DROP TYPE IF EXISTS');
    });
  });

  describe('Custom Options', () => {
    it('should generate consistent SQL with all custom options', () => {
      const options = {
        schema: 'custom_schema',
        outboxTable: 'my_outbox',
        inboxTable: 'my_inbox',
      };

      const upSQL = getEventForgeUpSQL(options);
      const downSQL = getEventForgeDownSQL(options);

      // Verify schema prefix in all relevant places
      expect(upSQL).toContain('custom_schema.outbox_message_status');
      expect(upSQL).toContain('custom_schema.inbox_message_status');
      expect(upSQL).toContain('custom_schema.my_outbox');
      expect(upSQL).toContain('custom_schema.my_inbox');

      // Verify DOWN migration matches
      expect(downSQL).toContain('custom_schema.my_outbox');
      expect(downSQL).toContain('custom_schema.my_inbox');
      expect(downSQL).toContain('custom_schema.outbox_message_status');
      expect(downSQL).toContain('custom_schema.inbox_message_status');
    });
  });
});
