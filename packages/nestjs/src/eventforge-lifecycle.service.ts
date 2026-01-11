import { Injectable, Inject, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { OutboxService } from '@prodforcode/event-forge-core';

import { OUTBOX_SERVICE } from './inbox-outbox.constants';

/**
 * Lifecycle service that automatically manages outbox polling
 * Starts polling on application bootstrap and stops on shutdown
 */
@Injectable()
export class EventForgeLifecycleService implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(OUTBOX_SERVICE) private readonly outboxService: OutboxService,
  ) {}

  /**
   * Start outbox polling when application is ready
   */
  onApplicationBootstrap(): void {
    this.outboxService.startPolling();
  }

  /**
   * Stop outbox polling gracefully on application shutdown
   */
  onApplicationShutdown(): void {
    this.outboxService.stopPolling();
  }
}
