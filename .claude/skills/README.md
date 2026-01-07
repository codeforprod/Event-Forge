# Event-Forge Skills

Project-specific skills for the Event-Forge inbox-outbox library.

## Available Skills

### event-forge-development

Core skill for implementing the Transactional Inbox-Outbox pattern.

**Use when:**
- Creating message-based services
- Implementing outbox/inbox repositories
- Adding database adapters (TypeORM, Mongoose)
- Configuring RabbitMQ publishers
- Integrating the NestJS InboxOutboxModule

**Key features:**
- Database-agnostic core interfaces
- Package structure overview
- NestJS module integration patterns
- Message flow and retry strategies

---

### typeorm-adapter

PostgreSQL adapter implementation using TypeORM.

**Use when:**
- Creating OutboxMessageEntity and InboxMessageEntity
- Implementing TypeOrmOutboxRepository with SKIP LOCKED
- Writing PostgreSQL migrations for outbox/inbox tables
- Configuring TypeORM connection for Event-Forge

**Key features:**
- Entity definitions with proper indexes
- SKIP LOCKED pattern for concurrent processing
- SQL migration scripts
- Transaction management with EntityManager

---

### mongoose-adapter

MongoDB adapter implementation using Mongoose.

**Use when:**
- Creating OutboxMessageSchema and InboxMessageSchema
- Implementing MongooseOutboxRepository with findOneAndUpdate
- Configuring MongoDB indexes for efficient polling
- Setting up Mongoose connection for Event-Forge

**Key features:**
- Schema definitions with @nestjs/mongoose
- Atomic findOneAndUpdate locking pattern
- Index configuration scripts
- Transaction support with ClientSession

---

### testing-event-forge

Comprehensive testing strategies for Event-Forge.

**Use when:**
- Writing unit tests for OutboxService and InboxService
- Creating integration tests with testcontainers
- Testing message flow and deduplication
- Verifying lock acquisition and retry logic

**Key features:**
- Repository mocking patterns
- Testcontainers setup (PostgreSQL, MongoDB, RabbitMQ)
- Transaction rollback testing
- Lock timeout and stale lock release tests

---

## Skill Structure

```
skills/
├── README.md                       # This file
├── event-forge-development/
│   ├── SKILL.md                    # Core development patterns
│   └── references/
│       └── interfaces.md           # Complete TypeScript interfaces
├── typeorm-adapter/
│   ├── SKILL.md                    # PostgreSQL/TypeORM patterns
│   └── references/
│       └── sql-patterns.md         # Advanced SQL patterns
├── mongoose-adapter/
│   ├── SKILL.md                    # MongoDB/Mongoose patterns
│   └── references/
│       └── mongodb-patterns.md     # Advanced MongoDB patterns
└── testing-event-forge/
    ├── SKILL.md                    # Testing strategies
    └── references/
        └── test-patterns.md        # Additional test patterns
```

## Usage

Skills are automatically activated when Claude Code detects relevant context:

- **event-forge-development**: Mention inbox-outbox patterns, message queuing, or Event-Forge components
- **typeorm-adapter**: Mention PostgreSQL, TypeORM, SKIP LOCKED, or SQL migrations
- **mongoose-adapter**: Mention MongoDB, Mongoose, findOneAndUpdate, or schema definitions
- **testing-event-forge**: Mention testing, testcontainers, mocking, or integration tests

## Quick Reference

| Skill | Package | Database | Key Pattern |
|-------|---------|----------|-------------|
| event-forge-development | @callairis/event-forge-core | Any | Core interfaces |
| typeorm-adapter | @callairis/event-forge-typeorm | PostgreSQL | SKIP LOCKED |
| mongoose-adapter | @callairis/event-forge-mongoose | MongoDB | findOneAndUpdate |
| testing-event-forge | - | Any | Testcontainers |
