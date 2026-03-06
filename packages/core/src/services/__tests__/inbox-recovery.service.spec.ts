import { InboxRecoveryService, RecoverySweepResult } from '../inbox-recovery.service';
import { InboxEvents } from '../inbox.service';
import { IInboxRepository } from '../../interfaces/inbox-repository.interface';
import { IMessagePublisher } from '../../interfaces/message-publisher.interface';
import { InboxMessage, InboxMessageStatus } from '../../interfaces/inbox-message.interface';

function createMockMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 'inbox-1',
    messageId: 'msg-1',
    source: 'test-service',
    eventType: 'user.created',
    payload: { name: 'John' },
    status: InboxMessageStatus.PROCESSING,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    recoveryAttempts: 0,
    ...overrides,
  };
}

// Use explicit jest.fn() for optional methods so TypeScript sees mock methods
function createMockRepository() {
  return {
    record: jest.fn(),
    exists: jest.fn(),
    markProcessing: jest.fn(),
    markProcessed: jest.fn(),
    markFailed: jest.fn(),
    deleteOlderThan: jest.fn(),
    findStuckProcessing: jest.fn().mockResolvedValue([]),
    resetForRetry: jest.fn().mockResolvedValue(true),
    markPermanentlyFailedRecovery: jest.fn().mockResolvedValue(undefined),
  } as IInboxRepository & {
    findStuckProcessing: jest.Mock;
    resetForRetry: jest.Mock;
    markPermanentlyFailedRecovery: jest.Mock;
    markFailed: jest.Mock;
  };
}

function createMockPublisher() {
  return {
    publish: jest.fn().mockResolvedValue(undefined),
  } as IMessagePublisher & { publish: jest.Mock };
}

describe('InboxRecoveryService', () => {
  let service: InboxRecoveryService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockPublisher: ReturnType<typeof createMockPublisher>;

  beforeEach(() => {
    mockRepo = createMockRepository();
    mockPublisher = createMockPublisher();
    service = new InboxRecoveryService(mockRepo, mockPublisher, {
      recovery: {
        enabled: true,
        intervalMs: 60000,
        processingTimeoutMs: 300000,
        maxRecoveryAttempts: 3,
        action: 'retry',
      },
    });
  });

  afterEach(async () => {
    await service.stop();
    jest.clearAllMocks();
  });

  describe('sweep', () => {
    it('should return empty result when no stuck messages', async () => {
      mockRepo.findStuckProcessing.mockResolvedValue([]);

      const result = await service.sweep();

      expect(result.total).toBe(0);
      expect(result.recovered).toBe(0);
      expect(result.permanentlyFailed).toBe(0);
    });

    it('should recover stuck messages by resetting and re-publishing', async () => {
      const stuckMessage = createMockMessage();
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);
      mockRepo.resetForRetry.mockResolvedValue(true);
      mockPublisher.publish.mockResolvedValue(undefined);

      const result = await service.sweep();

      expect(result.total).toBe(1);
      expect(result.recovered).toBe(1);
      expect(result.permanentlyFailed).toBe(0);
      expect(mockRepo.resetForRetry).toHaveBeenCalledWith(
        'inbox-1',
        expect.stringContaining('Processing timeout exceeded'),
      );
      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-1',
          aggregateType: 'test-service',
          aggregateId: 'msg-1',
          eventType: 'user.created',
        }),
        expect.objectContaining({
          routingKey: 'user.created',
          headers: expect.objectContaining({
            'x-recovery': 'true',
          }),
        }),
      );
    });

    it('should permanently fail messages that exceed max recovery attempts', async () => {
      const stuckMessage = createMockMessage({ recoveryAttempts: 3 });
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);

      const result = await service.sweep();

      expect(result.total).toBe(1);
      expect(result.recovered).toBe(0);
      expect(result.permanentlyFailed).toBe(1);
      expect(mockRepo.markPermanentlyFailedRecovery).toHaveBeenCalledWith(
        'inbox-1',
        expect.stringContaining('Exceeded max recovery attempts'),
      );
    });

    it('should skip recovery when another instance already recovered the message', async () => {
      const stuckMessage = createMockMessage();
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);
      mockRepo.resetForRetry.mockResolvedValue(false);

      const result = await service.sweep();

      expect(result.recovered).toBe(0);
      expect(result.permanentlyFailed).toBe(1);
      expect(mockPublisher.publish).not.toHaveBeenCalled();
    });

    it('should emit MESSAGE_RECOVERED event on successful recovery', async () => {
      const stuckMessage = createMockMessage();
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);
      mockRepo.resetForRetry.mockResolvedValue(true);

      const events: unknown[] = [];
      service.on(InboxEvents.MESSAGE_RECOVERED, (data) => events.push(data));

      await service.sweep();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(expect.objectContaining({
        messageId: 'msg-1',
        source: 'test-service',
        action: 'reset_and_republished',
        recoveryAttempts: 1,
      }));
    });

    it('should emit MESSAGE_RECOVERED event on permanent failure', async () => {
      const stuckMessage = createMockMessage({ recoveryAttempts: 3 });
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);

      const events: unknown[] = [];
      service.on(InboxEvents.MESSAGE_RECOVERED, (data) => events.push(data));

      await service.sweep();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(expect.objectContaining({
        messageId: 'msg-1',
        action: 'permanently_failed',
      }));
    });

    it('should emit recovery:sweep:completed when messages were found', async () => {
      mockRepo.findStuckProcessing.mockResolvedValue([createMockMessage()]);
      mockRepo.resetForRetry.mockResolvedValue(true);

      const events: RecoverySweepResult[] = [];
      service.on('recovery:sweep:completed', (data: RecoverySweepResult) => events.push(data));

      await service.sweep();

      expect(events).toHaveLength(1);
      expect(events[0].total).toBe(1);
      expect(events[0].recovered).toBe(1);
    });

    it('should not emit recovery:sweep:completed when no stuck messages', async () => {
      mockRepo.findStuckProcessing.mockResolvedValue([]);

      const events: unknown[] = [];
      service.on('recovery:sweep:completed', (data) => events.push(data));

      await service.sweep();

      expect(events).toHaveLength(0);
    });

    it('should handle per-message errors gracefully', async () => {
      const msg1 = createMockMessage({ id: 'inbox-1', messageId: 'msg-1' });
      const msg2 = createMockMessage({ id: 'inbox-2', messageId: 'msg-2' });
      mockRepo.findStuckProcessing.mockResolvedValue([msg1, msg2]);

      // First message throws, second succeeds
      mockRepo.resetForRetry
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(true);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.sweep();

      expect(result.total).toBe(2);
      expect(result.recovered).toBe(1); // Only msg2
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error recovering message msg-1'),
      );

      consoleSpy.mockRestore();
    });

    it('should continue recovery even when publish fails', async () => {
      const stuckMessage = createMockMessage();
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);
      mockRepo.resetForRetry.mockResolvedValue(true);
      mockPublisher.publish.mockRejectedValue(new Error('AMQP connection lost'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.sweep();

      // Still counts as recovered (DB reset succeeded)
      expect(result.recovered).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to re-publish'),
      );

      consoleSpy.mockRestore();
    });

    it('should handle null publisher gracefully', async () => {
      service = new InboxRecoveryService(mockRepo, null, {
        recovery: { enabled: true, intervalMs: 60000, processingTimeoutMs: 300000, maxRecoveryAttempts: 3, action: 'retry' },
      });

      const stuckMessage = createMockMessage();
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);
      mockRepo.resetForRetry.mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.sweep();

      expect(result.recovered).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No publisher available'),
      );

      consoleSpy.mockRestore();
    });

    it('should return empty result when repository lacks findStuckProcessing', async () => {
      const repoWithoutRecovery = {
        record: jest.fn(),
        exists: jest.fn(),
        markProcessing: jest.fn(),
        markProcessed: jest.fn(),
        markFailed: jest.fn(),
        deleteOlderThan: jest.fn(),
      } as unknown as IInboxRepository;

      service = new InboxRecoveryService(repoWithoutRecovery, mockPublisher, {
        recovery: { enabled: true, intervalMs: 60000, processingTimeoutMs: 300000, maxRecoveryAttempts: 3, action: 'retry' },
      });

      const result = await service.sweep();

      expect(result.total).toBe(0);
    });
  });

  describe('action: fail', () => {
    it('should permanently fail all stuck messages when action is fail', async () => {
      service = new InboxRecoveryService(mockRepo, mockPublisher, {
        recovery: { enabled: true, intervalMs: 60000, processingTimeoutMs: 300000, maxRecoveryAttempts: 3, action: 'fail' },
      });

      const stuckMessage = createMockMessage({ recoveryAttempts: 0 });
      mockRepo.findStuckProcessing.mockResolvedValue([stuckMessage]);

      const result = await service.sweep();

      expect(result.permanentlyFailed).toBe(1);
      expect(result.recovered).toBe(0);
      expect(mockRepo.markPermanentlyFailedRecovery).toHaveBeenCalled();
      expect(mockRepo.resetForRetry).not.toHaveBeenCalled();
    });
  });

  describe('fallback to markFailed when markPermanentlyFailedRecovery missing', () => {
    it('should use markFailed as fallback', async () => {
      const plainRepo = {
        record: jest.fn(),
        exists: jest.fn(),
        markProcessing: jest.fn(),
        markProcessed: jest.fn(),
        markFailed: jest.fn().mockResolvedValue(undefined),
        deleteOlderThan: jest.fn(),
        findStuckProcessing: jest.fn().mockResolvedValue([createMockMessage()]),
        resetForRetry: jest.fn(),
        // markPermanentlyFailedRecovery intentionally NOT provided
      } as unknown as IInboxRepository;

      service = new InboxRecoveryService(plainRepo, mockPublisher, {
        recovery: { enabled: true, intervalMs: 60000, processingTimeoutMs: 300000, maxRecoveryAttempts: 3, action: 'fail' },
      });

      const result = await service.sweep();

      expect(result.permanentlyFailed).toBe(1);
      expect((plainRepo as any).markFailed).toHaveBeenCalledWith(
        'inbox-1',
        expect.stringContaining('Recovery action configured as fail'),
        true,
      );
    });
  });

  describe('start/stop lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should not start when disabled', () => {
      service = new InboxRecoveryService(mockRepo, mockPublisher, {
        recovery: { enabled: false, intervalMs: 60000, processingTimeoutMs: 300000, maxRecoveryAttempts: 3, action: 'retry' },
      });

      service.start();

      jest.advanceTimersByTime(120000);

      expect(mockRepo.findStuckProcessing).not.toHaveBeenCalled();
    });

    it('should not start multiple timers', () => {
      service.start();
      service.start();
      service.start();

      // No error thrown
      expect(service).toBeDefined();
    });

    it('should stop cleanly', async () => {
      service.start();
      await service.stop();

      jest.advanceTimersByTime(120000);
      expect(mockRepo.findStuckProcessing).not.toHaveBeenCalled();
    });

    it('should await in-flight sweep on stop', async () => {
      let resolveFind!: (value: InboxMessage[]) => void;
      const findPromise = new Promise<InboxMessage[]>((resolve) => {
        resolveFind = resolve;
      });
      mockRepo.findStuckProcessing.mockReturnValue(findPromise);

      service.start();

      // Trigger sweep
      jest.advanceTimersByTime(60000);

      // Start stopping (should wait for sweep)
      const stopPromise = service.stop();

      // Resolve the in-flight sweep
      resolveFind([]);

      await stopPromise;

      // Should have completed cleanly
      expect(mockRepo.findStuckProcessing).toHaveBeenCalledTimes(1);
    });
  });

  describe('recovery sweep with multiple messages', () => {
    it('should process mix of recoverable and permanently failed messages', async () => {
      const recoverableMsg = createMockMessage({ id: 'inbox-1', messageId: 'msg-1', recoveryAttempts: 0 });
      const failedMsg = createMockMessage({ id: 'inbox-2', messageId: 'msg-2', recoveryAttempts: 3 });

      mockRepo.findStuckProcessing.mockResolvedValue([recoverableMsg, failedMsg]);
      mockRepo.resetForRetry.mockResolvedValue(true);

      const result = await service.sweep();

      expect(result.total).toBe(2);
      expect(result.recovered).toBe(1);
      expect(result.permanentlyFailed).toBe(1);
    });
  });
});
