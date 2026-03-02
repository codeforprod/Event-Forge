/**
 * DTO for creating/recording a new Inbox Message
 */
export interface CreateInboxMessageDto {
  /** External message ID for deduplication */
  messageId: string;

  /** Source system/service */
  source: string;

  /** Type of event received */
  eventType: string;

  /** Event payload data */
  payload: Record<string, unknown>;

  /** Optional metadata (e.g., trace context for distributed tracing) */
  metadata?: Record<string, unknown>;

  /** Maximum retry attempts (optional, defaults from config) */
  maxRetries?: number;
}
