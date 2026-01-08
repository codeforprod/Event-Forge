# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Event-Forge is a database-agnostic library implementing the **Transactional Inbox-Outbox pattern** for reliable message delivery in distributed systems. Part of the AIRIS ecosystem.

**Target consumers:** CallAiris-Backend (PostgreSQL/TypeORM), CallAiris-Agent (PostgreSQL/SQLAlchemy Python), Holocron (MongoDB/Mongoose)

## Build & Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Development mode
npm run build         # Build all packages
npm test              # Run all tests
npm run lint          # Lint codebase
npm run typecheck     # Type check
```

## Architecture

### Monorepo Package Structure

```
packages/
├── core/                 # @prodforcode/event-forge-core
│   ├── interfaces/       # IOutboxRepository, IInboxRepository, IMessagePublisher
│   ├── services/         # OutboxService, InboxService
│   └── errors/           # ProcessingError
├── adapter-typeorm/      # @prodforcode/event-forge-typeorm (PostgreSQL)
├── adapter-mongoose/     # @prodforcode/event-forge-mongoose (MongoDB)
├── publisher-rabbitmq/   # @prodforcode/event-forge-rabbitmq
├── nestjs/               # @prodforcode/event-forge-nestjs (DynamicModule)
└── python/               # callairis-event-forge (PyPI)
```

### Core Interfaces

**IOutboxRepository** - Stores outgoing messages with transactional guarantees:
- `create(dto, transactionContext?)` - Create within transaction
- `fetchAndLockPending(limit, lockerId)` - Atomic lock acquisition
- `markPublished(id)` / `markFailed(id, error, permanent?)`
- `withTransaction<T>(operation)` - Execute in transaction

**IInboxRepository** - Stores incoming messages with deduplication:
- `record(dto)` - Returns `{ message, isDuplicate }`
- `exists(messageId, source)` - Idempotency check

**IMessagePublisher** - Publishes to message brokers:
- `publish(message, options?)` - Returns success boolean

### Message Flow

```
1. Business logic + createMessage() in single transaction
2. Commit → EventEmitter.emit('outbox:created')
3. Immediate processing attempt via processMessage(id)
4. Fallback: Cron polling every 1s
5. Publish via IMessagePublisher → RabbitMQ
6. Mark published or retry with exponential backoff
```

### Status Flow

```
pending → processing → published
                   └→ failed → pending (retry with backoff)
                            └→ permanently_failed
```

## Database Adapters

### TypeORM (PostgreSQL)
- Uses `SELECT FOR UPDATE SKIP LOCKED` for concurrent message processing
- Entity: `OutboxMessageEntity` with compound indexes on (status, scheduledAt)

### Mongoose (MongoDB)
- Uses `findOneAndUpdate` for atomic locking
- Schema: `OutboxMessageDocument` with `isLocked` flag pattern

## Key Design Decisions

1. **Database-agnostic core** - Interfaces decouple from specific ORMs
2. **EventEmitter + polling hybrid** - Immediate processing with cron fallback
3. **Lock-based concurrency** - Safe multi-instance deployments
4. **Exponential backoff** - 5s, 10s, 20s, 40s, 80s with jitter

## Reference Documents

- `UNIVERSAL_INBOX-OUTBOX_LIBRARY_DESIGN.md` - Complete design specification
- `IMPLEMENTATION_TASK.md` - Jira task with acceptance criteria
- `.claude/skills/event-forge-development/` - Development skill with interface definitions

---

## ACE Integration

ACE (Agentic Context Engineering) framework is installed and configured for this project.

### Activation

When user types `/ace` or `@ACE`:
1. Load `~/.claude/agents/ACE_ORCHESTRATOR_PROMPT_v2.xml`
2. Execute full pipeline with TASK_VERIFIER verification loop
3. Max 10 iterations, auto-retry on verification failure
4. Stop only when all verification criteria pass

### Commands

| Command | Description |
|---------|-------------|
| `/ace {task}` | Execute full ACE pipeline for this project |
| `/ace-verify` | Run TASK_VERIFIER on current task |

### Workflow Steps

1. **Parse & Route** - Analyze task and determine execution strategy
2. **Load Skillbook** - Inject relevant skills from `.claude/skillbook/event-forge.json`
3. **Execute Pipeline** - Run the appropriate developer agents
4. **Verify** - Run TASK_VERIFIER to check all criteria
5. **Reflect & Retry** - If failed: reflect, learn, retry (max 10 iterations)
6. **Complete** - If passed: notify ready for review

### Configuration

- **Service Config**: `.claude/ace/config.yaml`
- **Skillbook**: `.claude/skillbook/event-forge.json`
- **Agent Files**: `.claude/.agent/` (TODO, DONE, LEARNINGS)

### Agent Pipeline

```
TASK_MANAGER → TECHNICAL_LEAD → QA_ENGINEER →
SKILLS_MASTER → GIT_MASTER → TASK_VERIFIER
```

### Verification Criteria

Before marking a task complete, TASK_VERIFIER checks:
- All requirements implemented
- Application starts without errors
- Application runs correctly
- All tests pass (100%)
- No critical lint/build errors
- Code follows standards
