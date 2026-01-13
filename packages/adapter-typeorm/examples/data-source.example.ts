import { DataSource } from 'typeorm';

/**
 * Example TypeORM DataSource configuration for Event-Forge migrations
 *
 * This file shows how to configure a DataSource for use with Event-Forge migration CLI commands.
 *
 * Usage:
 * ```bash
 * npx event-forge migration:list --data-source=./path/to/this/file.ts
 * npx event-forge migration:run --data-source=./path/to/this/file.ts
 * npx event-forge migration:rollback --data-source=./path/to/this/file.ts
 * ```
 */

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'myapp',

  // Include Event-Forge entities
  entities: [
    'src/entities/**/*.entity.ts',
  ],

  // Disable synchronize in production
  synchronize: false,

  // Enable logging for debugging
  logging: ['error', 'warn'],
});

export default AppDataSource;
