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
