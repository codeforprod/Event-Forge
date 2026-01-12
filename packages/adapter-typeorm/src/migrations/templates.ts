/**
 * SQL Templates for Event-Forge Database Migration Generation
 *
 * These templates generate PostgreSQL 12+ compatible SQL for creating
 * the outbox_messages and inbox_messages tables required by the
 * Transactional Inbox-Outbox pattern.
 */

export interface MigrationOptions {
  /** Table name for outbox messages (default: 'outbox_messages') */
  outboxTable?: string;
  /** Table name for inbox messages (default: 'inbox_messages') */
  inboxTable?: string;
  /** Schema name (default: 'public') */
  schema?: string;
}

/**
 * Generates CREATE TYPE statements for ENUM types
 */
export function generateEnumTypes(options: MigrationOptions = {}): string {
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';

  return `-- Create ENUM types for message status
CREATE TYPE ${schemaPrefix}outbox_message_status AS ENUM (
  'pending',
  'processing',
  'published',
  'failed',
  'permanently_failed'
);

CREATE TYPE ${schemaPrefix}inbox_message_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed'
);`;
}

/**
 * Generates CREATE TABLE statement for outbox_messages
 */
export function generateOutboxTable(options: MigrationOptions = {}): string {
  const tableName = options.outboxTable || 'outbox_messages';
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';
  const fullTableName = `${schemaPrefix}${tableName}`;

  return `-- Create outbox_messages table
CREATE TABLE ${fullTableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  status ${schemaPrefix}outbox_message_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_message TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  locked_by VARCHAR(255),
  locked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);`;
}

/**
 * Generates CREATE TABLE statement for inbox_messages
 */
export function generateInboxTable(options: MigrationOptions = {}): string {
  const tableName = options.inboxTable || 'inbox_messages';
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';
  const fullTableName = `${schemaPrefix}${tableName}`;

  return `-- Create inbox_messages table
CREATE TABLE ${fullTableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  status ${schemaPrefix}inbox_message_status NOT NULL DEFAULT 'received',
  processed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, source)
);`;
}

/**
 * Generates CREATE INDEX statements for outbox_messages
 */
export function generateOutboxIndexes(options: MigrationOptions = {}): string {
  const tableName = options.outboxTable || 'outbox_messages';
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';
  const fullTableName = `${schemaPrefix}${tableName}`;

  return `-- Create indexes for outbox_messages
-- Partial index for pending/failed messages (performance optimization)
CREATE INDEX idx_outbox_pending ON ${fullTableName} (status, scheduled_at, created_at)
  WHERE status IN ('pending', 'failed');

-- Index for aggregate lookups
CREATE INDEX idx_outbox_aggregate ON ${fullTableName} (aggregate_type, aggregate_id);

-- Index for event type filtering
CREATE INDEX idx_outbox_event_type ON ${fullTableName} (event_type);

-- Index for time-based queries
CREATE INDEX idx_outbox_created_at ON ${fullTableName} (created_at);`;
}

/**
 * Generates CREATE INDEX statements for inbox_messages
 */
export function generateInboxIndexes(options: MigrationOptions = {}): string {
  const tableName = options.inboxTable || 'inbox_messages';
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';
  const fullTableName = `${schemaPrefix}${tableName}`;

  return `-- Create indexes for inbox_messages
-- Index for event type filtering
CREATE INDEX idx_inbox_event_type ON ${fullTableName} (event_type);

-- Index for status filtering
CREATE INDEX idx_inbox_status ON ${fullTableName} (status);

-- Index for time-based queries
CREATE INDEX idx_inbox_created_at ON ${fullTableName} (created_at);

-- Index for received_at queries
CREATE INDEX idx_inbox_received_at ON ${fullTableName} (received_at);

-- Compound index for retry queries
CREATE INDEX idx_inbox_retry ON ${fullTableName} (status, retry_count, scheduled_at, created_at);`;
}

/**
 * Generates DROP TABLE statements for rollback
 */
export function generateDropTables(options: MigrationOptions = {}): string {
  const outboxTable = options.outboxTable || 'outbox_messages';
  const inboxTable = options.inboxTable || 'inbox_messages';
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';

  return `-- Drop tables
DROP TABLE IF EXISTS ${schemaPrefix}${outboxTable};
DROP TABLE IF EXISTS ${schemaPrefix}${inboxTable};`;
}

/**
 * Generates DROP TYPE statements for rollback
 */
export function generateDropTypes(options: MigrationOptions = {}): string {
  const schema = options.schema || 'public';
  const schemaPrefix = schema !== 'public' ? `${schema}.` : '';

  return `-- Drop ENUM types
DROP TYPE IF EXISTS ${schemaPrefix}outbox_message_status;
DROP TYPE IF EXISTS ${schemaPrefix}inbox_message_status;`;
}
