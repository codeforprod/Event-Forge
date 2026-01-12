import { DataSource, Repository } from 'typeorm';

import { EventForgeMigrationEntity } from '../entities/event-forge-migration.entity';

import { MigrationDiscovery } from './migration-discovery';
import {
  Migration,
  MigrationResult,
  MigrationStatus,
} from './migration.interface';

/**
 * Migration Manager
 *
 * Manages Event-Forge database migrations including:
 * - Tracking applied migrations
 * - Discovering available migrations
 * - Running pending migrations
 * - Rolling back migrations
 */
export class MigrationManager {
  private readonly migrationRepository: Repository<EventForgeMigrationEntity>;
  private readonly discovery: MigrationDiscovery;
  private isInitialized = false;

  constructor(
    private readonly dataSource: DataSource,
    customMigrationsPath?: string,
  ) {
    this.migrationRepository = this.dataSource.getRepository(
      EventForgeMigrationEntity,
    );
    this.discovery = new MigrationDiscovery(customMigrationsPath);
  }

  /**
   * Initializes the migration system by ensuring the tracking table exists
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.ensureMigrationTableExists();
    this.isInitialized = true;
  }

  /**
   * Ensures the migration tracking table exists
   */
  private async ensureMigrationTableExists(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS event_forge_migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_ef_migration_version
        ON event_forge_migrations (version);
      `);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Discovers all available migrations
   */
  async discoverMigrations(): Promise<Migration[]> {
    return this.discovery.discoverMigrations();
  }

  /**
   * Gets list of applied migration versions
   */
  async getAppliedMigrations(): Promise<string[]> {
    await this.initialize();

    const applied = await this.migrationRepository.find({
      order: { version: 'ASC' },
    });

    return applied.map((m) => m.version);
  }

  /**
   * Gets list of pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    await this.initialize();

    const [allMigrations, appliedVersions] = await Promise.all([
      this.discoverMigrations(),
      this.getAppliedMigrations(),
    ]);

    const appliedSet = new Set(appliedVersions);

    return allMigrations.filter((m) => !appliedSet.has(m.version));
  }

  /**
   * Lists all migrations with their status
   */
  async listMigrations(): Promise<MigrationStatus[]> {
    await this.initialize();

    const [allMigrations, appliedRecords] = await Promise.all([
      this.discoverMigrations(),
      this.migrationRepository.find({ order: { version: 'ASC' } }),
    ]);

    const appliedMap = new Map(
      appliedRecords.map((r) => [r.version, r.appliedAt]),
    );

    return allMigrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      applied: appliedMap.has(migration.version),
      appliedAt: appliedMap.get(migration.version),
    }));
  }

  /**
   * Runs all pending migrations
   */
  async runPendingMigrations(): Promise<MigrationResult[]> {
    await this.initialize();

    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      return [];
    }

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      const result = await this.runMigration(migration);
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Runs a single migration
   */
  private async runMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await migration.up(this.dataSource);

      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(EventForgeMigrationEntity)
        .values({
          version: migration.version,
          name: migration.name,
        })
        .execute();

      await queryRunner.commitTransaction();

      return {
        version: migration.version,
        name: migration.name,
        success: true,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return {
        version: migration.version,
        name: migration.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Rolls back the last N migrations
   */
  async rollback(count = 1): Promise<MigrationResult[]> {
    await this.initialize();

    const appliedRecords = await this.migrationRepository.find({
      order: { appliedAt: 'DESC' },
      take: count,
    });

    if (appliedRecords.length === 0) {
      return [];
    }

    const allMigrations = await this.discoverMigrations();
    const migrationMap = new Map(allMigrations.map((m) => [m.version, m]));

    const results: MigrationResult[] = [];

    for (const record of appliedRecords) {
      const migration = migrationMap.get(record.version);

      if (!migration) {
        results.push({
          version: record.version,
          name: record.name,
          success: false,
          error: 'Migration file not found',
          executionTime: 0,
        });
        continue;
      }

      const result = await this.rollbackMigration(migration, record.id);
      results.push(result);

      if (!result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Rolls back a single migration
   */
  private async rollbackMigration(
    migration: Migration,
    recordId: number,
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await migration.down(this.dataSource);

      await queryRunner.manager.delete(EventForgeMigrationEntity, recordId);

      await queryRunner.commitTransaction();

      return {
        version: migration.version,
        name: migration.name,
        success: true,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      return {
        version: migration.version,
        name: migration.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    } finally {
      await queryRunner.release();
    }
  }
}
