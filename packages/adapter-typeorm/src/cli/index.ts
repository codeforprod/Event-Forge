#!/usr/bin/env node

/**
 * Event-Forge CLI
 *
 * Command-line interface for Event-Forge TypeORM adapter utilities
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { Command } from 'commander';

import { createMigrationCommand } from './migration-command';
import { createMigrationListCommand } from './migration-list-command';
import { createMigrationRollbackCommand } from './migration-rollback-command';
import { createMigrationRunCommand } from './migration-run-command';

// Read version from package.json
interface PackageJson {
  version: string;
}

const packageJson: PackageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
) as PackageJson;

const program = new Command();

program
  .name('event-forge')
  .description('Event-Forge TypeORM Adapter CLI')
  .version(packageJson.version);

// Register commands
program.addCommand(createMigrationCommand());
program.addCommand(createMigrationListCommand());
program.addCommand(createMigrationRunCommand());
program.addCommand(createMigrationRollbackCommand());

// Parse arguments
program.parse(process.argv);
