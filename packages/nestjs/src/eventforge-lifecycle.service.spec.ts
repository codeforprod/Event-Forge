import { Test, TestingModule } from '@nestjs/testing';
import { EventForgeLifecycleService } from './eventforge-lifecycle.service';
import { OutboxService } from '@prodforcode/event-forge-core';
import { OUTBOX_SERVICE } from './inbox-outbox.constants';

describe('EventForgeLifecycleService', () => {
  let service: EventForgeLifecycleService;
  let mockOutboxService: jest.Mocked<OutboxService>;

  beforeEach(async () => {
    // Create mock OutboxService
    mockOutboxService = {
      startPolling: jest.fn(),
      stopPolling: jest.fn(),
    } as unknown as jest.Mocked<OutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventForgeLifecycleService,
        {
          provide: OUTBOX_SERVICE,
          useValue: mockOutboxService,
        },
      ],
    }).compile();

    service = module.get<EventForgeLifecycleService>(EventForgeLifecycleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should start outbox polling', () => {
      service.onApplicationBootstrap();

      expect(mockOutboxService.startPolling).toHaveBeenCalledTimes(1);
    });

    it('should call startPolling without arguments', () => {
      service.onApplicationBootstrap();

      expect(mockOutboxService.startPolling).toHaveBeenCalledWith();
    });
  });

  describe('onApplicationShutdown', () => {
    it('should stop outbox polling', () => {
      service.onApplicationShutdown();

      expect(mockOutboxService.stopPolling).toHaveBeenCalledTimes(1);
    });

    it('should call stopPolling without arguments', () => {
      service.onApplicationShutdown();

      expect(mockOutboxService.stopPolling).toHaveBeenCalledWith();
    });

    it('should gracefully handle shutdown after bootstrap', () => {
      service.onApplicationBootstrap();
      service.onApplicationShutdown();

      expect(mockOutboxService.startPolling).toHaveBeenCalledTimes(1);
      expect(mockOutboxService.stopPolling).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle integration', () => {
    it('should start and stop polling in correct order', () => {
      const calls: string[] = [];

      mockOutboxService.startPolling.mockImplementation(() => {
        calls.push('start');
      });

      mockOutboxService.stopPolling.mockImplementation(() => {
        calls.push('stop');
      });

      service.onApplicationBootstrap();
      service.onApplicationShutdown();

      expect(calls).toEqual(['start', 'stop']);
    });

    it('should allow multiple shutdown calls without errors', () => {
      service.onApplicationBootstrap();
      service.onApplicationShutdown();
      service.onApplicationShutdown();

      expect(mockOutboxService.stopPolling).toHaveBeenCalledTimes(2);
    });
  });
});
