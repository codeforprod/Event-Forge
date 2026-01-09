/**
 * CLI Command for Event-Forge Migration Generation
 *
 * Provides command-line interface for generating database migrations
 * without requiring an active TypeORM connection.
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  generateMigrationClass,
  generateRawSQLFile,
} from '../migrations/sql-generator';
import type { MigrationOptions } from '../migrations/templates';

export type OutputFormat = 'sql' | 'typeorm' | 'stdout';

export interface CLIOptions extends MigrationOptions {
  /** Output format: sql (raw SQL file), typeorm (TypeORM migration class), or stdout */
  format?: OutputFormat;
  /** Output directory path (required for sql and typeorm formats) */
  output?: string;
  /** Output filename (optional, auto-generated if not provided) */
  filename?: string;
}

/**
 * Generates a migration filename based on format
 */
function generateFilename(format: OutputFormat): string {
  const timestamp = Date.now();
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

  switch (format) {
    case 'typeorm':
      return `${timestamp}-EventForgeMigration.ts`;
    case 'sql':
      return `${date}-event-forge-migration.sql`;
    default:
      return `migration.sql`;
  }
}

/**
 * Generates migration content based on format
 */
function generateMigrationContent(
  format: OutputFormat,
  options: MigrationOptions,
): string {
  switch (format) {
    case 'typeorm':
      return generateMigrationClass(options);
    case 'sql':
    case 'stdout':
      return generateRawSQLFile(options);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Writes migration to file or stdout
 */
function writeMigration(
  content: string,
  format: OutputFormat,
  outputDir?: string,
  filename?: string,
): void {
  if (format === 'stdout') {
    // Output to stdout
    console.log(content);
    return;
  }

  if (!outputDir) {
    throw new Error('Output directory is required for file output formats');
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename if not provided
  const outputFilename = filename || generateFilename(format);
  const outputPath = path.join(outputDir, outputFilename);

  // Write file
  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`✅ Migration generated: ${outputPath}`);
}

/**
 * Validates CLI options
 */
function validateOptions(options: CLIOptions): void {
  if (options.format !== 'stdout' && !options.output) {
    throw new Error(
      'Output directory (--output) is required when format is not stdout',
    );
  }

  if (options.schema && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.schema)) {
    throw new Error(
      `Invalid schema name: ${options.schema}. Must be a valid PostgreSQL identifier.`,
    );
  }

  if (
    options.outboxTable &&
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.outboxTable)
  ) {
    throw new Error(
      `Invalid outbox table name: ${options.outboxTable}. Must be a valid PostgreSQL identifier.`,
    );
  }

  if (
    options.inboxTable &&
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.inboxTable)
  ) {
    throw new Error(
      `Invalid inbox table name: ${options.inboxTable}. Must be a valid PostgreSQL identifier.`,
    );
  }
}

/**
 * Executes migration generation
 */
export function executeMigrationGenerate(options: CLIOptions): void {
  try {
    // Validate options
    validateOptions(options);

    // Set defaults
    const format = options.format || 'stdout';
    const migrationOptions: MigrationOptions = {
      schema: options.schema,
      outboxTable: options.outboxTable,
      inboxTable: options.inboxTable,
    };

    // Generate migration content
    const content = generateMigrationContent(format, migrationOptions);

    // Write to file or stdout
    writeMigration(content, format, options.output, options.filename);

    // Print summary (unless outputting to stdout)
    if (format !== 'stdout') {
      console.log('\n📋 Migration Summary:');
      console.log(`   Format: ${format}`);
      console.log(`   Schema: ${migrationOptions.schema || 'public'}`);
      console.log(
        `   Outbox Table: ${migrationOptions.outboxTable || 'outbox_messages'}`,
      );
      console.log(
        `   Inbox Table: ${migrationOptions.inboxTable || 'inbox_messages'}`,
      );
    }
  } catch (error) {
    console.error('❌ Migration generation failed:');
    console.error(
      error instanceof Error ? error.message : 'Unknown error occurred',
    );
    process.exit(1);
  }
}

/**
 * Configures the migration:generate command
 */
export function createMigrationCommand(): Command {
  const command = new Command('migration:generate');

  command
    .description('Generate Event-Forge database migration')
    .option(
      '-f, --format <format>',
      'Output format: sql, typeorm, or stdout',
      'stdout',
    )
    .option('-o, --output <dir>', 'Output directory (required for sql/typeorm)')
    .option('--filename <name>', 'Output filename (optional)')
    .option('--schema <name>', 'Database schema name', 'public')
    .option('--outbox-table <name>', 'Outbox table name', 'outbox_messages')
    .option('--inbox-table <name>', 'Inbox table name', 'inbox_messages')
    .action((options) => {
      executeMigrationGenerate(options);
    });

  return command;
}
