import { DataSource } from 'typeorm';

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
 *   async up(dataSource: DataSource): Promise<void> {
 *     await dataSource.query('ALTER TABLE inbox_messages ADD COLUMN retry_count INTEGER');
 *   },
 *   async down(dataSource: DataSource): Promise<void> {
 *     await dataSource.query('ALTER TABLE inbox_messages DROP COLUMN retry_count');
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
   * @param dataSource - TypeORM DataSource for executing queries
   */
  up(dataSource: DataSource): Promise<void>;

  /**
   * Rollback the migration
   * @param dataSource - TypeORM DataSource for executing queries
   */
  down(dataSource: DataSource): Promise<void>;
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
