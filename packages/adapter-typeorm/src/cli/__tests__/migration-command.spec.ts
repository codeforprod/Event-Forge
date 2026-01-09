/**
 * Unit Tests for Migration CLI Command
 */

import * as fs from 'fs';
import { executeMigrationGenerate, type CLIOptions } from '../migration-command';

// Mock fs module
jest.mock('fs');

describe('Migration CLI Command', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('stdout format', () => {
    it('should output SQL to stdout', () => {
      const options: CLIOptions = {
        format: 'stdout',
      };

      executeMigrationGenerate(options);

      // Should log SQL content
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('CREATE TYPE outbox_message_status');
      expect(output).toContain('Event-Forge Database Migration');

      // Should not write to file
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should work with custom options', () => {
      const options: CLIOptions = {
        format: 'stdout',
        schema: 'messaging',
        outboxTable: 'my_outbox',
      };

      executeMigrationGenerate(options);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('messaging.my_outbox');
    });
  });

  describe('sql format', () => {
    it('should create output directory if not exists', () => {
      mockFs.existsSync.mockReturnValue(false);

      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/migrations', {
        recursive: true,
      });
    });

    it('should not recreate existing directory', () => {
      mockFs.existsSync.mockReturnValue(true);

      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should write SQL file with auto-generated filename', () => {
      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const [filePath, content] = mockFs.writeFileSync.mock.calls[0];

      // Check filename format (should be date-based)
      expect(filePath).toMatch(/\/test\/migrations\/\d{8}-event-forge-migration\.sql/);

      // Check content
      expect(content).toContain('Event-Forge Database Migration');
      expect(content).toContain('CREATE TYPE');
    });

    it('should write SQL file with custom filename', () => {
      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
        filename: 'custom-migration.sql',
      };

      executeMigrationGenerate(options);

      const [filePath] = mockFs.writeFileSync.mock.calls[0];
      expect(filePath).toBe('/test/migrations/custom-migration.sql');
    });

    it('should log success message', () => {
      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migration generated:'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migration Summary:'),
      );
    });
  });

  describe('typeorm format', () => {
    it('should write TypeORM migration class', () => {
      const options: CLIOptions = {
        format: 'typeorm',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const [filePath, content] = mockFs.writeFileSync.mock.calls[0];

      // Check filename format (timestamp-based)
      expect(filePath).toMatch(/\/test\/migrations\/\d+-EventForgeMigration\.ts/);

      // Check content is TypeScript migration class
      expect(content).toContain('import { MigrationInterface, QueryRunner }');
      expect(content).toContain('export class EventForgeMigration');
      expect(content).toContain('public async up');
      expect(content).toContain('public async down');
    });

    it('should work with custom options', () => {
      const options: CLIOptions = {
        format: 'typeorm',
        output: '/test/migrations',
        schema: 'messaging',
      };

      executeMigrationGenerate(options);

      const [, content] = mockFs.writeFileSync.mock.calls[0];
      expect(content).toContain('messaging.');
    });
  });

  describe('validation', () => {
    it('should require output directory for non-stdout formats', () => {
      const options: CLIOptions = {
        format: 'sql',
        // output missing
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Output directory'),
      );
    });

    it('should validate schema name', () => {
      const options: CLIOptions = {
        format: 'stdout',
        schema: 'invalid-schema!',
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid schema name'),
      );
    });

    it('should validate outbox table name', () => {
      const options: CLIOptions = {
        format: 'stdout',
        outboxTable: 'invalid table!',
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid outbox table name'),
      );
    });

    it('should validate inbox table name', () => {
      const options: CLIOptions = {
        format: 'stdout',
        inboxTable: 'invalid table!',
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid inbox table name'),
      );
    });

    it('should accept valid schema names', () => {
      const validSchemas = ['public', 'messaging', 'test_schema', 'schema123', '_schema'];

      validSchemas.forEach((schema) => {
        const options: CLIOptions = {
          format: 'stdout',
          schema,
        };

        expect(() => executeMigrationGenerate(options)).not.toThrow();
      });
    });

    it('should accept valid table names', () => {
      const validNames = ['outbox', 'my_outbox', 'outbox123', '_outbox'];

      validNames.forEach((tableName) => {
        const options: CLIOptions = {
          format: 'stdout',
          outboxTable: tableName,
          inboxTable: tableName,
        };

        expect(() => executeMigrationGenerate(options)).not.toThrow();
      });
    });
  });

  describe('error handling', () => {
    it('should handle file system errors', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migration generation failed'),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle unknown errors', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw 'Unknown error'; // Throwing non-Error object
      });

      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      expect(() => executeMigrationGenerate(options)).toThrow('process.exit called');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error occurred'),
      );
    });
  });

  describe('summary output', () => {
    it('should display summary for file outputs', () => {
      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
        schema: 'messaging',
        outboxTable: 'my_outbox',
        inboxTable: 'my_inbox',
      };

      executeMigrationGenerate(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migration Summary:'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Format: sql'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schema: messaging'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Outbox Table: my_outbox'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Inbox Table: my_inbox'),
      );
    });

    it('should not display summary for stdout output', () => {
      const options: CLIOptions = {
        format: 'stdout',
      };

      executeMigrationGenerate(options);

      const calls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const hasSummary = calls.some((call) =>
        typeof call === 'string' && call.includes('Migration Summary:'),
      );
      expect(hasSummary).toBe(false);
    });

    it('should use defaults in summary when options not provided', () => {
      const options: CLIOptions = {
        format: 'sql',
        output: '/test/migrations',
      };

      executeMigrationGenerate(options);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Schema: public'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Outbox Table: outbox_messages'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Inbox Table: inbox_messages'),
      );
    });
  });
});
