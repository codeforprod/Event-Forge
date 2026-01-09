#!/usr/bin/env node

/**
 * Event-Forge CLI
 *
 * Command-line interface for Event-Forge TypeORM adapter utilities
 */

import { Command } from 'commander';
import { createMigrationCommand } from './migration-command';

const program = new Command();

program
  .name('event-forge')
  .description('Event-Forge TypeORM Adapter CLI')
  .version('1.0.0');

// Register commands
program.addCommand(createMigrationCommand());

// Parse arguments
program.parse(process.argv);
