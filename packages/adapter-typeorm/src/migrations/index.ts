/**
 * Event-Forge Migration Generator
 *
 * Public API for programmatic migration generation
 */

export {
  getEventForgeUpSQL,
  getEventForgeDownSQL,
  generateMigrationClass,
  generateRawSQLFile,
} from './sql-generator';

export type { MigrationOptions } from './templates';

export {
  generateEnumTypes,
  generateOutboxTable,
  generateInboxTable,
  generateOutboxIndexes,
  generateInboxIndexes,
  generateDropTables,
  generateDropTypes,
} from './templates';

export { MigrationManager } from './migration-manager';
export { MigrationDiscovery } from './migration-discovery';
export type {
  Migration,
  MigrationStatus,
  MigrationResult,
} from './migration.interface';
