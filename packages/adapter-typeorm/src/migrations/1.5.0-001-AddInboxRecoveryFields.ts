import { QueryRunner } from 'typeorm';

import { Migration } from './migration.interface';

/**
 * Event-Forge Migration: Add recovery fields to inbox_messages
 *
 * Adds columns for inbox message recovery mechanism:
 * - updated_at: auto-updated timestamp for detecting stuck messages
 * - recovery_attempts: counter for recovery loop prevention
 * - last_recovered_at: when last recovery happened
 * - recovery_reason: why the message was recovered
 *
 * Also creates a partial index for efficient recovery sweep queries.
 *
 * Version: 1.5.0-001
 * Generated on: 2026-03-06T12:00:00.000Z
 */
export const migration: Migration = {
  version: '1.5.0-001',
  name: 'AddInboxRecoveryFields',

  async up(queryRunner: QueryRunner): Promise<void> {
    // Add updated_at column WITHOUT default first, so existing rows get NULL
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
    `);

    // Backfill existing rows with created_at (these are NULL since no default was set)
    await queryRunner.query(`
      UPDATE inbox_messages SET updated_at = created_at WHERE updated_at IS NULL;
    `);

    // Now set the default for future inserts
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ALTER COLUMN updated_at SET DEFAULT NOW();
    `);

    // Add recovery_attempts column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
    `);

    // Add last_recovered_at column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS last_recovered_at TIMESTAMP WITH TIME ZONE;
    `);

    // Add recovery_reason column
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS recovery_reason TEXT;
    `);

    // Create partial index for recovery sweep (only indexes processing messages)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_recovery_sweep
      ON inbox_messages (status, updated_at)
      WHERE status = 'processing';
    `);

    // Create trigger to auto-update updated_at on row change
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_inbox_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_inbox_updated_at ON inbox_messages;
      CREATE TRIGGER trg_inbox_updated_at
      BEFORE UPDATE ON inbox_messages
      FOR EACH ROW
      EXECUTE FUNCTION update_inbox_updated_at();
    `);
  },

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_inbox_updated_at ON inbox_messages;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_inbox_updated_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_inbox_recovery_sweep;`);
    await queryRunner.query(`ALTER TABLE inbox_messages DROP COLUMN IF EXISTS recovery_reason;`);
    await queryRunner.query(`ALTER TABLE inbox_messages DROP COLUMN IF EXISTS last_recovered_at;`);
    await queryRunner.query(`ALTER TABLE inbox_messages DROP COLUMN IF EXISTS recovery_attempts;`);
    await queryRunner.query(`ALTER TABLE inbox_messages DROP COLUMN IF EXISTS updated_at;`);
  },
};
