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
    Error.captureStackTrace(this, this.constructor);
  }
}
