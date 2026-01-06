/**
 * Processing Error
 * Thrown when message processing fails permanently (no retries)
 * Use this for validation errors, business rule violations, etc.
 */
export class ProcessingError extends Error {
  constructor(
    message: string,
    public readonly messageId: string,
    public readonly eventType: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ProcessingError';
    Error.captureStackTrace(this, this.constructor);
  }
}
