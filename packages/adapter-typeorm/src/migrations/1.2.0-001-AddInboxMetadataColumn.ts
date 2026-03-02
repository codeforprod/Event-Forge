import { QueryRunner } from 'typeorm';

import { Migration } from './migration.interface';

/**
 * Event-Forge Migration: Add metadata column to inbox_messages
 *
 * Adds a nullable JSONB metadata column to the inbox_messages table
 * for storing trace context and other metadata from inbound messages.
 *
 * Version: 1.2.0-001
 * Generated on: 2026-03-02T14:00:00.000Z
 */
export const migration: Migration = {
  version: '1.2.0-001',
  name: 'AddInboxMetadataColumn',

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;
    `);
  },

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inbox_messages
      DROP COLUMN IF EXISTS metadata;
    `);
  },
};
