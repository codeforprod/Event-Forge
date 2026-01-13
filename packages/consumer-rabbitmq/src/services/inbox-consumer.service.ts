import { Injectable } from '@nestjs/common';

/**
 * Service that manages inbox message recording for RabbitMQ consumers
 *
 * NOTE: As of v1.1.2, the wrapping logic has been moved directly into the
 * @InboxSubscribe decorator. This service is kept for backward compatibility
 * but no longer performs runtime method wrapping.
 *
 * The decorator now wraps methods at the prototype level (descriptor.value)
 * BEFORE @RabbitSubscribe is applied, ensuring that @golevelup/nestjs-rabbitmq
 * discovers and registers the WRAPPED handler.
 */
@Injectable()
export class InboxConsumerService {
  /**
   * Service is now a placeholder for backward compatibility
   * All inbox recording logic is handled by @InboxSubscribe decorator
   */
  constructor() {
    // Service kept for backward compatibility
  }
}
