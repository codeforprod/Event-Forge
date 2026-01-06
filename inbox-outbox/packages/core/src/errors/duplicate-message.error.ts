/**
 * Duplicate Message Error
 * Thrown when attempting to process a message that has already been received
 */
export class DuplicateMessageError extends Error {
  constructor(
    public readonly messageId: string,
    public readonly source: string,
  ) {
    super(`Duplicate message: ${messageId} from ${source}`);
    this.name = 'DuplicateMessageError';

    // captureStackTrace is only available in V8 (Node.js, Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
