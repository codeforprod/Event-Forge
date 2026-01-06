/**
 * DTO for creating a new Outbox Message
 */
export interface CreateOutboxMessageDto {
  /** Type of the aggregate (entity) */
  aggregateType: string;

  /** ID of the specific aggregate instance */
  aggregateId: string;

  /** Type of event being published */
  eventType: string;

  /** Event payload data */
  payload: Record<string, unknown>;

  /** Optional metadata for routing, correlation, etc. */
  metadata?: Record<string, unknown>;

  /** Optional scheduled time for delayed processing */
  scheduledAt?: Date;

  /** Optional max retry attempts (defaults to repository/service config) */
  maxRetries?: number;
}
