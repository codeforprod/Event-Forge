# @prodforcode/event-forge-rabbitmq

RabbitMQ publishers for the Universal Inbox-Outbox Pattern library.

## Publishers

### GolevelupPublisher

Basic RabbitMQ publisher using `@golevelup/nestjs-rabbitmq` for immediate message delivery.

```typescript
import { GolevelupPublisher } from '@prodforcode/event-forge-rabbitmq';

const publisher = new GolevelupPublisher(
  amqpConnection,
  'events.exchange'
);
```

### DelayedMessagePublisher

Advanced RabbitMQ publisher with support for delayed message delivery using RabbitMQ's `x-delayed-message` exchange plugin.

#### Prerequisites

The DelayedMessagePublisher requires the RabbitMQ `rabbitmq_delayed_message_exchange` plugin to be enabled on your RabbitMQ server.

**Installation:**

```bash
# Enable the plugin
rabbitmq-plugins enable rabbitmq_delayed_message_exchange

# Restart RabbitMQ
rabbitmqctl restart
```

**Exchange Configuration:**

You must create a delayed exchange with type `x-delayed-message`:

```bash
# Using rabbitmqadmin
rabbitmqadmin declare exchange name=events.delayed type=x-delayed-message arguments='{"x-delayed-type": "topic"}'
```

Or programmatically:

```typescript
await channel.assertExchange('events.delayed', 'x-delayed-message', {
  durable: true,
  arguments: {
    'x-delayed-type': 'topic'
  }
});
```

#### Usage

```typescript
import { DelayedMessagePublisher } from '@prodforcode/event-forge-rabbitmq';

const publisher = new DelayedMessagePublisher(
  amqpConnection,
  {
    directExchange: 'events.direct',    // For immediate messages
    delayedExchange: 'events.delayed'   // For delayed messages
  }
);

// Immediate message (uses directExchange)
await publisher.publish(message);

// Delayed message (uses delayedExchange)
await publisher.publish({
  ...message,
  metadata: {
    delay: 5000  // Delay in milliseconds
  }
});
```

#### Message Routing Logic

The DelayedMessagePublisher automatically selects the appropriate exchange based on the presence of `metadata.delay`:

- **No delay or invalid delay**: Uses `directExchange` for immediate delivery
- **Valid delay (number >= 0)**: Uses `delayedExchange` with `x-delay` header set

#### Metadata Delay Format

The `metadata.delay` field must be:
- A number (milliseconds)
- Greater than or equal to 0
- Present in the message metadata object

Example:

```typescript
const message: OutboxMessage = {
  id: 'msg-123',
  aggregateType: 'User',
  aggregateId: 'user-456',
  eventType: 'user.created',
  payload: { name: 'John Doe' },
  metadata: {
    delay: 10000  // Deliver after 10 seconds
  },
  // ... other fields
};

await publisher.publish(message);
```

#### Error Handling

If the RabbitMQ server does not have the delayed message plugin enabled or the delayed exchange is not properly configured, publishing delayed messages will fail with an error from RabbitMQ.

### MicroservicesPublisher

RabbitMQ publisher using `@nestjs/microservices` for NestJS microservices architecture.

```typescript
import { MicroservicesPublisher } from '@prodforcode/event-forge-rabbitmq';

const publisher = new MicroservicesPublisher(clientProxy);
```

## Installation

```bash
npm install @prodforcode/event-forge-rabbitmq
```

Peer dependencies (install based on your needs):

```bash
# For GolevelupPublisher and DelayedMessagePublisher
npm install @golevelup/nestjs-rabbitmq @nestjs/common

# For MicroservicesPublisher
npm install @nestjs/microservices @nestjs/common
```

## License

MIT
