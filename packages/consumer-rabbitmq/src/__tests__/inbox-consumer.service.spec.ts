import { Test, TestingModule } from '@nestjs/testing';

import { InboxConsumerService } from '../services/inbox-consumer.service';

describe('InboxConsumerService', () => {
  let service: InboxConsumerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InboxConsumerService],
    }).compile();

    service = module.get<InboxConsumerService>(InboxConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be instantiable without parameters', () => {
    const directInstance = new InboxConsumerService();
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(InboxConsumerService);
  });

  it('should be backward compatible placeholder', () => {
    // Service is kept for backward compatibility
    // All inbox recording logic is now in @InboxSubscribe decorator
    expect(service).toBeDefined();
  });
});
