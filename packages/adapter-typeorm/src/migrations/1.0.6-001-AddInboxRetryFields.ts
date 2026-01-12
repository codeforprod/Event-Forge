import { DataSource } from 'typeorm';

import { Migration } from './migration.interface';

/**
 * Event-Forge Migration: Add retry mechanism fields to inbox_messages
 *
 * This migration adds the following fields to the inbox_messages table:
 * - retry_count: Number of retry attempts (default: 0)
 * - max_retries: Maximum retry attempts allowed (default: 3)
 * - scheduled_at: Timestamp for scheduled retry (nullable)
 *
 * Also creates a compound index for efficient retry queries.
 *
 * Version: 1.0.6-001
 * Generated on: 2025-01-12T15:31:24.000Z
 */
export const migration: Migration = {
  version: '1.0.6-001',
  name: 'AddInboxRetryFields',

  async up(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    `);

    await dataSource.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;
    `);

    await dataSource.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
    `);

    await dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_retry
      ON inbox_messages (status, retry_count, scheduled_at, created_at);
    `);
  },

  async down(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      DROP INDEX IF EXISTS idx_inbox_retry;
    `);

    await dataSource.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS scheduled_at;
    `);

    await dataSource.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS max_retries;
    `);

    await dataSource.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS retry_count;
    `);
  },
};
