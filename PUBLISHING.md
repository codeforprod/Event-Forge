# Publishing Guide

This document describes how to publish Event-Forge packages to NPM and PyPI using automated CI/CD with Changesets.

## Overview

Event-Forge uses [Changesets](https://github.com/changesets/changesets) for version management and automated publishing to:

**NPM** (5 packages):
- `@event-forge/inbox-outbox-core`
- `@event-forge/inbox-outbox-typeorm`
- `@event-forge/inbox-outbox-mongoose`
- `@event-forge/inbox-outbox-rabbitmq`
- `@event-forge/inbox-outbox-nestjs`

**PyPI** (1 package):
- `event-forge-inbox-outbox`

Publishing is triggered automatically when changes are merged to the `main` branch.

## Developer Workflow

### 1. Make Changes

Make your code changes as usual in a feature branch.

### 2. Create Changeset

Before committing, create a changeset to describe your changes:

```bash
pnpm changeset
```

This will:
- Ask which packages changed
- Ask for change type (major/minor/patch)
- Ask for a description of the change

The changeset file will be added to `.changeset/` directory.

### 3. Commit and Create PR

Commit your changes including the changeset file:

```bash
git add .changeset/your-changeset-file.md
git commit -m "feat: your feature description"
git push
```

Create a PR to `main` branch.

### 4. Merge PR

When your PR is merged to `main`, the automation takes over:

## Automation Flow

```
Push to main → release.yml workflow triggers
    ↓
Changesets detected?
    ↓
YES: Create "Version Packages" PR
    ↓
Merge "Version Packages" PR
    ↓
Publish to NPM (all 5 packages)
    ↓
Publish to PyPI (Python package)
```

## Required Configuration

### GitHub Secrets

Configure these in GitHub Settings → Secrets and variables → Actions:

| Secret | Source | Purpose |
|--------|--------|---------|
| `NPM_TOKEN` | npmjs.com | NPM package publishing |
| `GITHUB_TOKEN` | Auto-provided | PR creation, releases |

### GitHub Environments

Create environment in GitHub Settings → Environments:

| Environment | Purpose | Protection (Optional) |
|-------------|---------|----------------------|
| `pypi` | PyPI publishing | Required reviewers for production releases |

### NPM Token Setup

1. Login to [npmjs.com](https://www.npmjs.com)
2. Go to Access Tokens → Generate New Token
3. Select "Automation" token type
4. Copy token and add to GitHub Secrets as `NPM_TOKEN`

### PyPI Trusted Publisher Setup

PyPI uses OIDC Trusted Publishers (no manual tokens needed):

1. Go to [PyPI](https://pypi.org)
2. Create project `event-forge-inbox-outbox` (or configure existing)
3. Go to Project Settings → Publishing
4. Add Trusted Publisher:
   - **Owner**: `{your-github-org-or-username}`
   - **Repository**: `Event-Forge`
   - **Workflow name**: `release.yml`
   - **Environment**: `pypi`

## Manual Commands

### Create Changeset

```bash
pnpm changeset
```

### Version Packages (Local Testing)

```bash
pnpm version-packages
```

This updates package.json files based on changesets.

### Sync Python Version

```bash
pnpm sync-versions
```

Syncs version from core package to Python package.

### Publish (CI/CD Only - Do Not Run Locally!)

```bash
pnpm release
```

**WARNING:** This command performs REAL publishing to NPM using `pnpm publish -r`. It does NOT support `--dry-run` flag. This command should ONLY run in CI/CD with proper authentication.

For local testing:
- Use `pnpm build` to verify builds work
- Use `pnpm test` to verify tests pass
- Use `pnpm changeset` to create changesets for testing the PR workflow
- Refer to [Changesets documentation](https://github.com/changesets/changesets) for local testing guidance
- Never run `pnpm release` or `pnpm ci:publish` locally unless you intend to publish packages

## Version Synchronization

All NPM packages are linked via Changesets `linked` configuration, meaning they will always have the same version.

The Python package version is automatically synchronized from `packages/core/package.json` via the `sync-versions` script.

## Workflow Files

- `.github/workflows/release.yml` - Main release workflow
- `.github/workflows/ci.yml` - PR validation (tests, lint, build)
- `.github/workflows/publish.yml.old` - Old tag-based workflow (kept for reference)

## Troubleshooting

### "No changesets found"

You forgot to run `pnpm changeset` before committing. Add a changeset and commit it.

### NPM publish fails

Check that:
- `NPM_TOKEN` secret is configured in GitHub Settings
- Token has "Automation" type
- Packages have `access: public` in `.changeset/config.json` (already configured)

### PyPI publish fails

Check that:
- GitHub environment `pypi` exists
- Trusted Publisher is configured on PyPI
- Workflow name matches exactly: `release.yml`
- Environment name matches exactly: `pypi`

### Version mismatch between NPM and Python

Run `pnpm sync-versions` to sync versions.

## Changeset Configuration

Configuration is in `.changeset/config.json`:

- `linked`: All @event-forge packages are linked (same version)
- `access`: "public" for NPM publishing
- `baseBranch`: "main"
- `updateInternalDependencies`: "patch" for inter-package deps

## References

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Using Changesets with pnpm](https://pnpm.io/using-changesets)
- [PyPI Trusted Publishers](https://docs.pypi.org/trusted-publishers/)
- [Changesets GitHub Action](https://github.com/changesets/action)
