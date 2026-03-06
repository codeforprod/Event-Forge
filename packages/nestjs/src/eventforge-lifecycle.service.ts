import { Injectable, Inject, Optional, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { OutboxService, InboxRecoveryService } from '@prodforcode/event-forge-core';

import { OUTBOX_SERVICE, INBOX_RECOVERY_SERVICE } from './inbox-outbox.constants';

/**
 * Lifecycle service that automatically manages outbox polling and inbox recovery
 * Starts polling/recovery on application bootstrap and stops on shutdown
 */
@Injectable()
export class EventForgeLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(OUTBOX_SERVICE) private readonly outboxService: OutboxService,
    @Optional() @Inject(INBOX_RECOVERY_SERVICE) private readonly inboxRecoveryService?: InboxRecoveryService | null,
  ) {}

  /**
   * Start outbox polling and inbox recovery when application is ready
   */
  onApplicationBootstrap(): void {
    this.outboxService.startPolling();
    if (this.inboxRecoveryService) {
      this.inboxRecoveryService.start();
    }
  }

  /**
   * Stop outbox polling and inbox recovery gracefully on application shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    this.outboxService.stopPolling();
    if (this.inboxRecoveryService) {
      await this.inboxRecoveryService.stop();
    }
  }
}
