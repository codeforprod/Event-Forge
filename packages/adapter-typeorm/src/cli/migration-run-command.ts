import { Command } from 'commander';
import { DataSource } from 'typeorm';

import { MigrationManager } from '../migrations/migration-manager';

/**
 * CLI Options for migration:run command
 */
export interface MigrationRunOptions {
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
 * Executes migration:run command
 */
export async function executeMigrationRun(
  options: MigrationRunOptions,
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

    console.log('🔍 Discovering pending migrations...');
    const pending = await manager.getPendingMigrations();

    if (pending.length === 0) {
      console.log('✅ No pending migrations found');
      return;
    }

    console.log(`📋 Found ${pending.length} pending migration(s):\n`);
    pending.forEach((m) => {
      console.log(`   - ${m.version} ${m.name}`);
    });

    console.log('\n🚀 Running migrations...\n');

    const results = await manager.runPendingMigrations();

    console.log('📊 Migration Results:\n');
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
      console.log('\n✅ All migrations completed successfully');
    } else {
      console.log('\n❌ Some migrations failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration execution failed:');
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
 * Creates the migration:run command
 */
export function createMigrationRunCommand(): Command {
  const command = new Command('migration:run');

  command
    .description('Run pending Event-Forge migrations')
    .requiredOption(
      '-d, --data-source <path>',
      'Path to TypeORM DataSource configuration file',
    )
    .option(
      '-m, --migrations-path <path>',
      'Custom migrations directory path',
    )
    .action(async (options: MigrationRunOptions) => {
      await executeMigrationRun(options);
    });

  return command;
}
