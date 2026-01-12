import { SetMetadata } from '@nestjs/common';

import {
  InboxSubscribe,
  INBOX_SUBSCRIBE_METADATA,
} from '../decorators/inbox-subscribe.decorator';

jest.mock('@nestjs/common');
jest.mock('@golevelup/nestjs-rabbitmq', () => ({
  RabbitSubscribe: jest.fn(),
}));

describe('InboxSubscribe Decorator', () => {
  let setMetadataMock: jest.Mock;
  let rabbitSubscribeMock: jest.Mock;

  beforeEach(() => {
    const { RabbitSubscribe } = require('@golevelup/nestjs-rabbitmq');

    setMetadataMock = jest.fn(() => jest.fn());
    rabbitSubscribeMock = jest.fn(() => jest.fn());

    (SetMetadata as jest.Mock) = setMetadataMock;
    RabbitSubscribe.mockImplementation(rabbitSubscribeMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should apply metadata with INBOX_SUBSCRIBE_METADATA key', () => {
    const options = {
      exchange: 'events',
      routingKey: 'user.created',
      source: 'user-service',
    };

    const decorator = InboxSubscribe(options);
    const target = {};
    const propertyKey = 'handleUserCreated';
    const descriptor = { value: jest.fn() };

    decorator(target, propertyKey, descriptor);

    expect(setMetadataMock).toHaveBeenCalledWith(
      INBOX_SUBSCRIBE_METADATA,
      options,
    );
  });

  it('should apply RabbitSubscribe with correct options', () => {
    const options = {
      exchange: 'events',
      routingKey: 'user.created',
      queue: 'user-queue',
      queueOptions: { durable: true },
      source: 'user-service',
    };

    const decorator = InboxSubscribe(options);
    const target = {};
    const propertyKey = 'handleUserCreated';
    const descriptor = { value: jest.fn() };

    decorator(target, propertyKey, descriptor);

    expect(rabbitSubscribeMock).toHaveBeenCalledWith({
      exchange: 'events',
      routingKey: 'user.created',
      queue: 'user-queue',
      queueOptions: { durable: true },
    });
  });

  it('should work with multiple routing keys', () => {
    const options = {
      exchange: 'events',
      routingKey: ['user.created', 'user.updated'],
      source: 'user-service',
    };

    const decorator = InboxSubscribe(options);
    const target = {};
    const propertyKey = 'handleUserEvents';
    const descriptor = { value: jest.fn() };

    decorator(target, propertyKey, descriptor);

    expect(rabbitSubscribeMock).toHaveBeenCalledWith({
      exchange: 'events',
      routingKey: ['user.created', 'user.updated'],
      queue: undefined,
      queueOptions: undefined,
    });
  });

  it('should return the descriptor', () => {
    const options = {
      exchange: 'events',
      routingKey: 'user.created',
      source: 'user-service',
    };

    const decorator = InboxSubscribe(options);
    const target = {};
    const propertyKey = 'handleUserCreated';
    const descriptor = { value: jest.fn() };

    const result = decorator(target, propertyKey, descriptor);

    expect(result).toBe(descriptor);
  });
});
