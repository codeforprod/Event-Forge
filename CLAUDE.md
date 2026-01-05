# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Event-Forge is a project within the AIRIS ecosystem.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Type check
npm run typecheck
```

## Architecture

*To be documented as the codebase develops.*

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
