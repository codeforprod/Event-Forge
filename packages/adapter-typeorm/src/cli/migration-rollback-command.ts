import { Command } from 'commander';
import { DataSource } from 'typeorm';

import { MigrationManager } from '../migrations/migration-manager';

/**
 * CLI Options for migration:rollback command
 */
export interface MigrationRollbackOptions {
  /** Path to TypeORM DataSource configuration file */
  dataSource: string;
  /** Custom migrations directory path */
  migrationsPath?: string;
  /** Number of migrations to rollback */
  count?: string;
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
 * Executes migration:rollback command
 */
export async function executeMigrationRollback(
  options: MigrationRollbackOptions,
): Promise<void> {
  let dataSource: DataSource | null = null;

  try {
    const count = options.count ? parseInt(options.count, 10) : 1;

    if (isNaN(count) || count < 1) {
      throw new Error('Count must be a positive integer');
    }

    console.log('🔄 Loading DataSource configuration...');
    dataSource = await loadDataSource(options.dataSource);

    if (!dataSource.isInitialized) {
      console.log('🔌 Initializing database connection...');
      await dataSource.initialize();
    }

    console.log('✅ Database connected\n');

    const manager = new MigrationManager(dataSource, options.migrationsPath);

    console.log(`🔍 Rolling back last ${count} migration(s)...\n`);

    const results = await manager.rollback(count);

    if (results.length === 0) {
      console.log('⚠️  No migrations to rollback');
      return;
    }

    console.log('📊 Rollback Results:\n');
    results.forEach((result) => {
      const status = result.success ? '✅' : '❌';
      const time = `(${result.executionTime}ms)`;
      console.log(`   ${status} ${result.version} ${result.name} ${time}`);

      if (!result.success && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    });

    const allSuccessful = results.every((r) => r.success);
    if (allSuccessful) {
      console.log('\n✅ All rollbacks completed successfully');
    } else {
      console.log('\n❌ Some rollbacks failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Rollback execution failed:');
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
 * Creates the migration:rollback command
 */
export function createMigrationRollbackCommand(): Command {
  const command = new Command('migration:rollback');

  command
    .description('Rollback Event-Forge migrations')
    .requiredOption(
      '-d, --data-source <path>',
      'Path to TypeORM DataSource configuration file',
    )
    .option(
      '-m, --migrations-path <path>',
      'Custom migrations directory path',
    )
    .option('-c, --count <number>', 'Number of migrations to rollback', '1')
    .action(async (options: MigrationRollbackOptions) => {
      await executeMigrationRollback(options);
    });

  return command;
}
