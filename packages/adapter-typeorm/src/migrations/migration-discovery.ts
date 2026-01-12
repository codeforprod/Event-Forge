import * as fs from 'fs';
import * as path from 'path';

import { Migration } from './migration.interface';

/**
 * Type guard for migration module structure
 */
interface MigrationModule {
  migration?: unknown;
}

/**
 * Migration Discovery Service
 *
 * Discovers and loads Event-Forge migration files from the package.
 * Supports both compiled JavaScript and TypeScript source files.
 */
export class MigrationDiscovery {
  private readonly migrationsPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.migrationsPath = path.isAbsolute(customPath)
        ? customPath
        : path.join(process.cwd(), customPath);
    } else {
      this.migrationsPath = path.join(__dirname);
    }
  }

  /**
   * Discovers all migration files in the migrations directory
   * @returns Array of Migration objects sorted by version
   */
  async discoverMigrations(): Promise<Migration[]> {
    if (!fs.existsSync(this.migrationsPath)) {
      return [];
    }

    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((file) => this.isMigrationFile(file));

    const migrations: Migration[] = [];

    for (const file of files) {
      const migration = await this.loadMigration(file);
      if (migration) {
        migrations.push(migration);
      }
    }

    return this.sortMigrations(migrations);
  }

  /**
   * Loads a single migration file
   */
  private async loadMigration(filename: string): Promise<Migration | null> {
    const filePath = path.join(this.migrationsPath, filename);

    try {
      const module = (await import(filePath)) as MigrationModule;

      if (module.migration && this.isValidMigration(module.migration)) {
        return module.migration as Migration;
      }

      return null;
    } catch (error) {
      console.error(`Failed to load migration ${filename}:`, error);
      return null;
    }
  }

  /**
   * Checks if a file is a migration file
   */
  private isMigrationFile(filename: string): boolean {
    const migrationPattern = /^\d+\.\d+\.\d+-\d{3}-.*\.(js|ts)$/;
    return migrationPattern.test(filename) && !filename.endsWith('.d.ts');
  }

  /**
   * Validates that an object implements the Migration interface
   */
  private isValidMigration(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const migration = obj as Record<string, unknown>;

    return (
      typeof migration.version === 'string' &&
      typeof migration.name === 'string' &&
      typeof migration.up === 'function' &&
      typeof migration.down === 'function'
    );
  }

  /**
   * Sorts migrations by semantic version
   */
  private sortMigrations(migrations: Migration[]): Migration[] {
    return migrations.sort((a, b) => {
      return this.compareVersions(a.version, b.version);
    });
  }

  /**
   * Compares two semantic versions with sequence numbers
   * Format: {major}.{minor}.{patch}-{sequence}
   */
  private compareVersions(v1: string, v2: string): number {
    const [version1, seq1] = v1.split('-');
    const [version2, seq2] = v2.split('-');

    const parts1 = version1.split('.').map(Number);
    const parts2 = version2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] !== parts2[i]) {
        return parts1[i] - parts2[i];
      }
    }

    return Number(seq1) - Number(seq2);
  }
}
