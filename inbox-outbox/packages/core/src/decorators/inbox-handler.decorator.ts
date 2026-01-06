import 'reflect-metadata';

/**
 * Metadata key for inbox handlers
 */
export const INBOX_HANDLER_METADATA = 'inbox-outbox:inbox-handler';

/**
 * Inbox Handler Options
 */
export interface InboxHandlerOptions {
  /** Event type to handle */
  eventType: string;

  /** Optional source filter (only process messages from this source) */
  source?: string;
}

/**
 * Decorator to mark a method as an inbox handler
 * Automatically registers the handler with InboxService
 *
 * @example
 * ```typescript
 * @InboxHandler({ eventType: 'user.created', source: 'user-service' })
 * async handleUserCreated(message: InboxMessage) {
 *   // Process incoming message
 * }
 * ```
 */
export function InboxHandler(options: InboxHandlerOptions): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    (Reflect as any).defineMetadata(INBOX_HANDLER_METADATA, options, descriptor.value as object);
    return descriptor;
  };
}
