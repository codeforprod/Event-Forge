# Event-Forge Skills

Project-specific skills for the Event-Forge inbox-outbox library.

## Available Skills

### event-forge-development

Implements Transactional Inbox-Outbox pattern for reliable message delivery in distributed systems.

**Use when:**
- Creating message-based services
- Implementing outbox/inbox repositories
- Adding database adapters (TypeORM, Mongoose)
- Configuring RabbitMQ publishers
- Integrating the NestJS InboxOutboxModule

**Key features:**
- Database-agnostic core interfaces
- TypeORM adapter for PostgreSQL
- Mongoose adapter for MongoDB
- RabbitMQ publisher implementations
- NestJS module with dependency injection
- Complete interface definitions and schema references

## Skill Structure

```
skills/
├── README.md                    # This file
└── event-forge-development/
    ├── SKILL.md                 # Main skill instructions
    └── references/
        └── interfaces.md        # Complete TypeScript interfaces
```

## Usage

Skills are automatically activated when Claude Code detects relevant context. Mention inbox-outbox patterns, message queuing, or Event-Forge components to trigger the skill.
