import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IInboxRepository } from '@prodforcode/event-forge-core';

import {
  INBOX_SUBSCRIBE_METADATA,
} from '../decorators/inbox-subscribe.decorator';
import { INBOX_CONSUMER_OPTIONS } from '../inbox-consumer.module';
import {
  InboxConsumerOptions,
  InboxSubscribeOptions,
} from '../interfaces/inbox-consumer-options.interface';
import { RabbitMQMessage } from '../interfaces/rabbitmq-message.interface';

/**
 * Type guard to check if a value is a record object
 */
function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard to check if a value is an instance wrapper
 */
function hasInstance(
  wrapper: unknown,
): wrapper is { instance: unknown; isAlias: boolean } {
  return (
    isRecordObject(wrapper) &&
    'instance' in wrapper &&
    'isAlias' in wrapper &&
    typeof wrapper.isAlias === 'boolean'
  );
}

/**
 * Service that intercepts @InboxSubscribe decorated methods
 * and automatically records messages in the inbox before handler execution
 */
@Injectable()
export class InboxConsumerService implements OnModuleInit {
  private readonly logger = new Logger(InboxConsumerService.name);
  private readonly wrappedHandlers = new Set<string>();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly inboxRepository: IInboxRepository,
    @Inject(INBOX_CONSUMER_OPTIONS)
    private readonly options: InboxConsumerOptions,
  ) {}

  /**
   * Discovers all methods decorated with @InboxSubscribe and wraps them
   */
  onModuleInit(): void {
    this.logger.log('Initializing InboxConsumer service...');

    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();

    const allWrappers = [...providers, ...controllers];

    for (const wrapper of allWrappers) {
      if (!hasInstance(wrapper) || !wrapper.instance || wrapper.isAlias) {
        continue;
      }

      const instance = wrapper.instance as Record<string, unknown>;

      if (!isRecordObject(instance)) {
        continue;
      }

      const prototype = Object.getPrototypeOf(instance) as unknown;
      if (!isRecordObject(prototype)) {
        continue;
      }

      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const method = instance[methodName];

        if (typeof method !== 'function') {
          continue;
        }

        const metadata = this.reflector.get<InboxSubscribeOptions>(
          INBOX_SUBSCRIBE_METADATA,
          method,
        );

        if (!metadata) {
          continue;
        }

        this.wrapHandlerMethod(instance, methodName, metadata);
      }
    }

    this.logger.log(
      `InboxConsumer initialized with ${this.wrappedHandlers.size} handlers`,
    );
  }

  /**
   * Wraps a handler method to add inbox recording logic
   */
  private wrapHandlerMethod(
    instance: Record<string, unknown>,
    methodName: string,
    metadata: InboxSubscribeOptions,
  ): void {
    const instanceConstructor = instance.constructor as { name: string };
    const handlerId = `${instanceConstructor.name}.${methodName}`;

    if (this.wrappedHandlers.has(handlerId)) {
      return;
    }

    const originalMethod = instance[methodName];

    if (typeof originalMethod !== 'function') {
      this.logger.warn(`Method ${handlerId} is not a function, skipping wrap`);
      return;
    }

    // Store the original method with proper typing
    const originalHandler = originalMethod as (...args: unknown[]) => unknown;

    instance[methodName] = async (...args: unknown[]): Promise<unknown> => {
      const message = args[0] as RabbitMQMessage;

      try {
        const result = await this.handleInboxMessage(
          message,
          metadata,
          originalHandler,
          instance,
          args,
        );
        return result;
      } catch (error) {
        this.logger.error(
          `Error in inbox handler ${handlerId}:`,
          error instanceof Error ? error.stack : error,
        );

        if (this.options.onError) {
          await this.options.onError(error as Error, message);
        }

        throw error;
      }
    };

    this.wrappedHandlers.add(handlerId);
    this.logger.debug(`Wrapped handler: ${handlerId}`);
  }

  /**
   * Handles inbox message recording and invokes original handler
   */
  private async handleInboxMessage(
    message: RabbitMQMessage,
    metadata: InboxSubscribeOptions,
    originalHandler: (...args: unknown[]) => unknown,
    context: Record<string, unknown>,
    args: unknown[],
  ): Promise<unknown> {
    const messageId = this.extractMessageId(message, metadata);
    const source = this.extractSource(metadata);
    const eventType = this.extractEventType(message, metadata);

    this.logger.debug(
      `Processing message: ${messageId} from ${source} (type: ${eventType})`,
    );

    const { message: inboxMessage, isDuplicate } =
      await this.inboxRepository.record({
        messageId,
        source,
        eventType,
        payload: message,
      });

    if (isDuplicate) {
      const logDuplicates = this.options.logDuplicates ?? true;

      if (logDuplicates) {
        this.logger.log(
          `Duplicate message detected: ${messageId} from ${source}, skipping handler`,
        );
      }

      return;
    }

    this.logger.debug(
      `Message ${messageId} recorded in inbox (${inboxMessage.id}), invoking handler`,
    );

    return originalHandler.apply(context, args);
  }

  /**
   * Extracts message ID from message
   */
  private extractMessageId(
    message: RabbitMQMessage,
    metadata: InboxSubscribeOptions,
  ): string {
    if (metadata.messageIdExtractor) {
      return metadata.messageIdExtractor(message);
    }

    if (message.properties?.messageId) {
      return String(message.properties.messageId);
    }

    throw new Error(
      'Unable to extract message ID. Please provide messageIdExtractor or ensure message has properties.messageId.',
    );
  }

  /**
   * Extracts source identifier
   */
  private extractSource(metadata: InboxSubscribeOptions): string {
    if (metadata.source) {
      return metadata.source;
    }

    if (this.options.defaultSource) {
      return this.options.defaultSource;
    }

    throw new Error(
      'Source identifier is required. Set source in decorator or defaultSource in module options.',
    );
  }

  /**
   * Extracts event type from message
   */
  private extractEventType(
    message: RabbitMQMessage,
    metadata: InboxSubscribeOptions,
  ): string {
    if (metadata.eventTypeExtractor) {
      return metadata.eventTypeExtractor(message);
    }

    if (message.properties?.type) {
      return String(message.properties.type);
    }

    if (typeof metadata.routingKey === 'string') {
      return metadata.routingKey;
    }

    if (Array.isArray(metadata.routingKey) && metadata.routingKey.length > 0) {
      return metadata.routingKey[0];
    }

    return 'unknown';
  }
}
