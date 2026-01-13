import { QueryRunner } from 'typeorm';

/**
 * Event-Forge Migration Interface
 *
 * Defines the contract for Event-Forge migrations.
 * Migrations are versioned using semantic versioning with sequence numbers.
 *
 * @example
 * ```typescript
 * export const migration: Migration = {
 *   version: '1.0.6-001',
 *   name: 'AddInboxRetryFields',
 *   async up(queryRunner: QueryRunner): Promise<void> {
 *     await queryRunner.query('ALTER TABLE inbox_messages ADD COLUMN retry_count INTEGER');
 *   },
 *   async down(queryRunner: QueryRunner): Promise<void> {
 *     await queryRunner.query('ALTER TABLE inbox_messages DROP COLUMN retry_count');
 *   },
 * };
 * ```
 */
export interface Migration {
  /**
   * Semantic version with sequence number
   * Format: {major}.{minor}.{patch}-{sequence}
   * Example: '1.0.6-001', '1.1.0-001'
   */
  version: string;

  /**
   * Human-readable migration name
   * Example: 'AddInboxRetryFields'
   */
  name: string;

  /**
   * Apply the migration
   * @param queryRunner - TypeORM QueryRunner for executing queries within transaction
   */
  up(queryRunner: QueryRunner): Promise<void>;

  /**
   * Rollback the migration
   * @param queryRunner - TypeORM QueryRunner for executing queries within transaction
   */
  down(queryRunner: QueryRunner): Promise<void>;
}

/**
 * Migration status information
 */
export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  appliedAt?: Date;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  version: string;
  name: string;
  success: boolean;
  error?: string;
  executionTime: number;
}
