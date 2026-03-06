import { EventEmitter } from 'events';

import { DEFAULT_RECOVERY_CONFIG, InboxConfig, InboxRecoveryConfig } from '../config/inbox.config';
import { InboxMessage } from '../interfaces/inbox-message.interface';
import { IInboxRepository } from '../interfaces/inbox-repository.interface';
import { IMessagePublisher, PublishOptions } from '../interfaces/message-publisher.interface';
import { OutboxMessageStatus } from '../interfaces/outbox-message.interface';

import { InboxEvents } from './inbox.service';

/**
 * Result of a recovery sweep iteration
 */
export interface RecoverySweepResult {
  /** Number of messages successfully recovered (reset + re-published) */
  recovered: number;

  /** Number of messages marked as permanently failed */
  permanentlyFailed: number;

  /** Total stuck messages found in this sweep */
  total: number;

  /** Duration of the sweep in milliseconds */
  durationMs: number;
}

/**
 * Inbox Recovery Service
 *
 * Tier 2 recovery mechanism for inbox messages stuck in `processing` status.
 * Periodically sweeps the inbox for stuck messages and either:
 * - Resets them to `failed` + re-publishes to RabbitMQ (action: 'retry')
 * - Marks them as `permanently_failed` (action: 'fail' or max attempts exceeded)
 *
 * Tier 1 (primary): Status-aware deduplication in record() + RabbitMQ redelivery
 * handles the majority of crash recovery scenarios automatically.
 */
export class InboxRecoveryService extends EventEmitter {
  private readonly config: Required<InboxRecoveryConfig>;
  private sweepTimer?: ReturnType<typeof setInterval>;
  private sweepInProgress = false;
  private currentSweepPromise?: Promise<RecoverySweepResult>;

  constructor(
    private readonly repository: IInboxRepository,
    private readonly publisher: IMessagePublisher | null,
    config?: InboxConfig,
  ) {
    super();
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config?.recovery };
  }

  /**
   * Start the periodic recovery sweep
   */
  start(): void {
    if (!this.config.enabled || this.sweepTimer) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      void this.runSweep();
    }, this.config.intervalMs);
  }

  /**
   * Stop the recovery sweep and await any in-flight operation
   */
  async stop(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }

    if (this.sweepInProgress && this.currentSweepPromise) {
      await this.currentSweepPromise;
    }
  }

  /**
   * Run a single recovery sweep (can be called manually for testing)
   */
  async sweep(): Promise<RecoverySweepResult> {
    const startTime = Date.now();
    const cutoffDate = new Date(Date.now() - this.config.processingTimeoutMs);

    if (!this.repository.findStuckProcessing) {
      return { recovered: 0, permanentlyFailed: 0, total: 0, durationMs: Date.now() - startTime };
    }

    const stuckMessages = await this.repository.findStuckProcessing(cutoffDate, 100);

    let recovered = 0;
    let permanentlyFailed = 0;

    for (const message of stuckMessages) {
      try {
        const recoveryAttempts = message.recoveryAttempts ?? 0;
        const shouldFail = this.config.action === 'fail'
          || recoveryAttempts >= this.config.maxRecoveryAttempts;

        if (shouldFail) {
          await this.handlePermanentFailure(message, recoveryAttempts);
          permanentlyFailed++;
        } else {
          const didRecover = await this.handleRetry(message);
          if (didRecover) {
            recovered++;
          } else {
            permanentlyFailed++;
          }
        }
      } catch (error) {
        // Per-message error: log and continue with next message
        console.error(
          `[InboxRecovery] Error recovering message ${message.messageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const result: RecoverySweepResult = {
      recovered,
      permanentlyFailed,
      total: stuckMessages.length,
      durationMs: Date.now() - startTime,
    };

    if (stuckMessages.length > 0) {
      this.emit('recovery:sweep:completed', result);
    }

    return result;
  }

  /**
   * Handle retry: reset to failed in DB + re-publish to RabbitMQ
   */
  private async handleRetry(message: InboxMessage): Promise<boolean> {
    const reason = `Processing timeout exceeded: message stuck since ${message.updatedAt?.toISOString() ?? 'unknown'}`;

    if (!this.repository.resetForRetry) {
      return false;
    }

    const didReset = await this.repository.resetForRetry(message.id, reason);
    if (!didReset) {
      // Another instance already recovered this message
      return false;
    }

    // Re-publish to RabbitMQ so the consumer picks it up again
    let publishSucceeded = false;
    if (this.publisher) {
      try {
        const publishOptions: PublishOptions = {
          routingKey: message.eventType,
          headers: {
            'x-recovery': 'true',
            'x-recovery-reason': reason,
            'x-original-source': message.source,
          },
        };

        // Construct a minimal OutboxMessage-compatible object for the publisher
        await this.publisher.publish(
          {
            id: message.messageId,
            aggregateType: message.source,
            aggregateId: message.messageId,
            eventType: message.eventType,
            payload: message.payload,
            metadata: {
              ...message.metadata,
              routingKey: message.eventType,
            },
            status: OutboxMessageStatus.PENDING,
            retryCount: 0,
            maxRetries: 0,
            createdAt: message.createdAt,
            updatedAt: new Date(),
          },
          publishOptions,
        );
        publishSucceeded = true;
      } catch (publishError) {
        console.error(
          `[InboxRecovery] Failed to re-publish message ${message.messageId}: ${
            publishError instanceof Error ? publishError.message : String(publishError)
          }. Message reset to failed in DB but not re-published.`,
        );
      }
    } else {
      console.warn(
        `[InboxRecovery] No publisher available for re-publish. Message ${message.messageId} reset to failed but awaits manual re-delivery.`,
      );
    }

    this.emit(InboxEvents.MESSAGE_RECOVERED, {
      messageId: message.messageId,
      id: message.id,
      source: message.source,
      eventType: message.eventType,
      reason,
      action: publishSucceeded ? 'reset_and_republished' : 'reset_only',
      recoveryAttempts: (message.recoveryAttempts ?? 0) + 1,
    });

    return true;
  }

  /**
   * Handle permanent failure: mark message as permanently failed
   */
  private async handlePermanentFailure(message: InboxMessage, recoveryAttempts: number): Promise<void> {
    const reason = this.config.action === 'fail'
      ? 'Recovery action configured as fail'
      : `Exceeded max recovery attempts (${recoveryAttempts}/${this.config.maxRecoveryAttempts})`;

    if (this.repository.markPermanentlyFailedRecovery) {
      await this.repository.markPermanentlyFailedRecovery(message.id, reason);
    } else {
      await this.repository.markFailed(message.id, reason, true);
    }

    this.emit(InboxEvents.MESSAGE_RECOVERED, {
      messageId: message.messageId,
      id: message.id,
      source: message.source,
      eventType: message.eventType,
      reason,
      action: 'permanently_failed',
      recoveryAttempts: recoveryAttempts + 1,
    });
  }

  /**
   * Internal: run sweep with in-flight tracking
   */
  private async runSweep(): Promise<void> {
    if (this.sweepInProgress) {
      return;
    }

    this.sweepInProgress = true;
    this.currentSweepPromise = this.sweep();

    try {
      await this.currentSweepPromise;
    } catch (error) {
      console.error(
        `[InboxRecovery] Sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweepInProgress = false;
      this.currentSweepPromise = undefined;
    }
  }
}
