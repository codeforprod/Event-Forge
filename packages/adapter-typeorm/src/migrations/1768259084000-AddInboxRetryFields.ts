import { MigrationInterface, QueryRunner } from 'typeorm';

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
 * Generated on: 2025-01-12T15:31:24.000Z
 */
export class AddInboxRetryFields1768259084000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add retry_count column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
    `);

    // Add max_retries column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3;
    `);

    // Add scheduled_at column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE;
    `);

    // Create compound index for retry queries (status, retry_count, scheduled_at, created_at)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_retry
      ON inbox_messages (status, retry_count, scheduled_at, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the compound index first
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_inbox_retry;
    `);

    // Drop the scheduled_at column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS scheduled_at;
    `);

    // Drop the max_retries column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS max_retries;
    `);

    // Drop the retry_count column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS retry_count;
    `);
  }
}
