import 'reflect-metadata';

/**
 * Metadata key for outbox handlers
 */
export const OUTBOX_HANDLER_METADATA = 'inbox-outbox:outbox-handler';

/**
 * Outbox Handler Options
 */
export interface OutboxHandlerOptions {
  /** Event type to handle */
  eventType: string;

  /** Optional cron expression for polling */
  cron?: string;

  /** Enable event-based triggering (default: true) */
  eventBased?: boolean;
}

/**
 * Decorator to mark a method as an outbox handler
 * Can be used with both cron-based polling and event-based triggering
 *
 * @example
 * ```typescript
 * @OutboxHandler({ eventType: 'user.created', cron: '0 * * * * *' })
 * async handleUserCreated() {
 *   // Process outbox messages
 * }
 * ```
 */
export function OutboxHandler(options: OutboxHandlerOptions): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    (Reflect as any).defineMetadata(OUTBOX_HANDLER_METADATA, options, descriptor.value as object);
    return descriptor;
  };
}
