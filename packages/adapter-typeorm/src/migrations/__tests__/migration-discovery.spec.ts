import { MigrationDiscovery } from '../migration-discovery';
import { Migration } from '../migration.interface';

describe('MigrationDiscovery', () => {
  describe('discoverMigrations', () => {
    it('should discover migrations in default directory', async () => {
      const discovery = new MigrationDiscovery();
      const migrations = await discovery.discoverMigrations();

      expect(Array.isArray(migrations)).toBe(true);

      const hasRetryMigration = migrations.some(
        (m) => m.version === '1.0.6-001' && m.name === 'AddInboxRetryFields',
      );
      expect(hasRetryMigration).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      const discovery = new MigrationDiscovery('/non/existent/path');
      const migrations = await discovery.discoverMigrations();
      expect(migrations).toEqual([]);
    });

    it('should sort migrations by version', async () => {
      const discovery = new MigrationDiscovery();
      const migrations = await discovery.discoverMigrations();

      for (let i = 1; i < migrations.length; i++) {
        const prev = migrations[i - 1].version;
        const curr = migrations[i].version;

        const prevParts = prev.split('-').map((p, idx) =>
          idx === 0 ? p.split('.').map(Number) : [Number(p)]
        );
        const currParts = curr.split('-').map((p, idx) =>
          idx === 0 ? p.split('.').map(Number) : [Number(p)]
        );

        const prevMajor = prevParts[0][0];
        const prevMinor = prevParts[0][1];
        const prevPatch = prevParts[0][2];
        const prevSeq = prevParts[1][0];

        const currMajor = currParts[0][0];
        const currMinor = currParts[0][1];
        const currPatch = currParts[0][2];
        const currSeq = currParts[1][0];

        if (prevMajor !== currMajor) {
          expect(prevMajor).toBeLessThan(currMajor);
        } else if (prevMinor !== currMinor) {
          expect(prevMinor).toBeLessThan(currMinor);
        } else if (prevPatch !== currPatch) {
          expect(prevPatch).toBeLessThan(currPatch);
        } else {
          expect(prevSeq).toBeLessThanOrEqual(currSeq);
        }
      }
    });
  });

  describe('migration validation', () => {
    it('should load valid migration files', async () => {
      const discovery = new MigrationDiscovery();
      const migrations = await discovery.discoverMigrations();

      migrations.forEach((migration) => {
        expect(migration.version).toBeDefined();
        expect(typeof migration.version).toBe('string');
        expect(migration.name).toBeDefined();
        expect(typeof migration.name).toBe('string');
        expect(typeof migration.up).toBe('function');
        expect(typeof migration.down).toBe('function');
      });
    });

    it('should skip files that do not match migration pattern', async () => {
      const discovery = new MigrationDiscovery();
      const migrations = await discovery.discoverMigrations();

      const invalidPatterns = [
        'not-a-migration.ts',
        'migration.ts',
        '1.0.0.ts',
        'random-file.ts',
      ];

      migrations.forEach((migration) => {
        invalidPatterns.forEach((pattern) => {
          expect(migration.name).not.toContain(pattern);
        });
      });
    });
  });

  describe('version comparison', () => {
    it('should correctly sort semantic versions', () => {
      const versions = [
        '2.0.0-001',
        '1.0.0-001',
        '1.1.0-001',
        '1.0.1-001',
        '1.0.0-002',
      ];

      const expectedOrder = [
        '1.0.0-001',
        '1.0.0-002',
        '1.0.1-001',
        '1.1.0-001',
        '2.0.0-001',
      ];

      const mockMigrations: Migration[] = versions.map((version) => ({
        version,
        name: `Migration-${version}`,
        async up() {},
        async down() {},
      }));

      const discovery = new MigrationDiscovery();
      const sorted = (discovery as any).sortMigrations(mockMigrations);

      const sortedVersions = sorted.map((m: Migration) => m.version);
      expect(sortedVersions).toEqual(expectedOrder);
    });
  });
});
