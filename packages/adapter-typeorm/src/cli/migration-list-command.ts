import { Command } from 'commander';
import { DataSource } from 'typeorm';

import { MigrationManager } from '../migrations/migration-manager';

/**
 * CLI Options for migration:list command
 */
export interface MigrationListOptions {
  /** Path to TypeORM DataSource configuration file */
  dataSource: string;
  /** Custom migrations directory path */
  migrationsPath?: string;
}

/**
 * Type guard to check if imported module has DataSource
 */
interface DataSourceModule {
  default?: unknown;
  AppDataSource?: unknown;
}

/**
 * Loads TypeORM DataSource from configuration file
 */
async function loadDataSource(configPath: string): Promise<DataSource> {
  try {
    const module = (await import(configPath)) as DataSourceModule;
    const dataSource = module.default || module.AppDataSource;

    if (!dataSource || !(dataSource instanceof DataSource)) {
      throw new Error(
        'Configuration file must export a TypeORM DataSource instance',
      );
    }

    return dataSource;
  } catch (error) {
    throw new Error(
      `Failed to load DataSource from ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Executes migration:list command
 */
export async function executeMigrationList(
  options: MigrationListOptions,
): Promise<void> {
  let dataSource: DataSource | null = null;

  try {
    console.log('🔄 Loading DataSource configuration...');
    dataSource = await loadDataSource(options.dataSource);

    if (!dataSource.isInitialized) {
      console.log('🔌 Initializing database connection...');
      await dataSource.initialize();
    }

    console.log('✅ Database connected\n');

    const manager = new MigrationManager(dataSource, options.migrationsPath);

    console.log('🔍 Loading migrations...');
    const migrations = await manager.listMigrations();

    if (migrations.length === 0) {
      console.log('\n⚠️  No migrations found');
      return;
    }

    console.log(`\n📋 Found ${migrations.length} migration(s):\n`);

    const pendingCount = migrations.filter((m) => !m.applied).length;
    const appliedCount = migrations.filter((m) => m.applied).length;

    console.log(`   Applied: ${appliedCount}`);
    console.log(`   Pending: ${pendingCount}\n`);

    console.log('Status | Version       | Name');
    console.log('-------|---------------|------------------------------');

    migrations.forEach((migration) => {
      const status = migration.applied ? '✅' : '⏳';
      const version = migration.version.padEnd(13);
      const appliedInfo = migration.appliedAt
        ? ` (${migration.appliedAt.toISOString()})`
        : '';

      console.log(`${status}     | ${version} | ${migration.name}${appliedInfo}`);
    });

    console.log('');
  } catch (error) {
    console.error('❌ Failed to list migrations:');
    console.error(
      error instanceof Error ? error.message : 'Unknown error occurred',
    );
    process.exit(1);
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Creates the migration:list command
 */
export function createMigrationListCommand(): Command {
  const command = new Command('migration:list');

  command
    .description('List all Event-Forge migrations with status')
    .requiredOption(
      '-d, --data-source <path>',
      'Path to TypeORM DataSource configuration file',
    )
    .option(
      '-m, --migrations-path <path>',
      'Custom migrations directory path',
    )
    .action(async (options: MigrationListOptions) => {
      await executeMigrationList(options);
    });

  return command;
}
