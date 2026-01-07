# CI/CD Setup Verification Checklist

This checklist verifies that all components for automated NPM and PyPI publishing are correctly configured.

## ✅ Phase 1: Changesets Installation

- [x] Changesets CLI installed (`@changesets/cli` in devDependencies)
- [x] `.changeset/` directory exists
- [x] `.changeset/config.json` configured with:
  - [x] `linked`: ["@event-forge/inbox-outbox-*"]
  - [x] `access`: "public"
  - [x] `baseBranch`: "main"

## ✅ Phase 2: Scripts

- [x] Version sync script created (`scripts/sync-python-version.js`)
- [x] Script is executable
- [x] Script successfully syncs version from core to Python package
- [x] package.json includes all required scripts:
  - [x] `changeset`
  - [x] `version-packages`
  - [x] `sync-versions`
  - [x] `ci:publish`
  - [x] `release`

## ✅ Phase 3: GitHub Workflows

- [x] `.github/workflows/release.yml` created
- [x] Workflow triggers on push to main
- [x] Workflow includes concurrency control
- [x] NPM publishing job configured with:
  - [x] pnpm setup
  - [x] Node.js 20
  - [x] Build step
  - [x] Test step
  - [x] Version sync step
  - [x] Changesets action integration
- [x] Python publishing job configured with:
  - [x] Conditional execution (only when NPM published)
  - [x] PyPI environment
  - [x] Trusted Publisher setup (pypa/gh-action-pypi-publish)
  - [x] Attestations enabled
- [x] Old `publish.yml` renamed to `publish.yml.old`

## ✅ Phase 4: Documentation

- [x] `PUBLISHING.md` created with:
  - [x] Developer workflow
  - [x] Automation flow diagram
  - [x] Required secrets documentation
  - [x] GitHub environments setup
  - [x] NPM token setup instructions
  - [x] PyPI Trusted Publisher setup instructions
  - [x] Troubleshooting guide
  - [x] Manual commands reference

## ⏳ Phase 5: External Configuration (Manual Steps Required)

### NPM Token (npmjs.com)
- [ ] Login to npmjs.com
- [ ] Generate "Automation" token
- [ ] Add token to GitHub Secrets as `NPM_TOKEN`

### PyPI Trusted Publisher (pypi.org)
- [ ] Create/configure project `event-forge-inbox-outbox`
- [ ] Add Trusted Publisher with:
  - [ ] Owner: `{github-org-or-username}`
  - [ ] Repository: `Event-Forge`
  - [ ] Workflow: `release.yml`
  - [ ] Environment: `pypi`

### GitHub Environment
- [ ] Create environment named `pypi` in GitHub Settings
- [ ] (Optional) Configure required reviewers
- [ ] (Optional) Restrict to `main` branch

## ✅ Phase 6: Testing

- [x] Build succeeds (`pnpm run build`)
- [x] Tests pass (`pnpm test`)
- [x] Version sync script works (`pnpm run sync-versions`)
- [x] All 5 NPM packages build successfully:
  - [x] @event-forge/inbox-outbox-core
  - [x] @event-forge/inbox-outbox-typeorm
  - [x] @event-forge/inbox-outbox-mongoose
  - [x] @event-forge/inbox-outbox-rabbitmq
  - [x] @event-forge/inbox-outbox-nestjs

## Summary

### Completed Locally ✅
- Changesets configuration
- Version sync automation
- GitHub Actions workflows
- Documentation

### Requires Manual Setup ⚠️
- NPM_TOKEN secret in GitHub
- PyPI Trusted Publisher configuration
- GitHub `pypi` environment creation

## Next Steps

1. **Commit and push** these changes to a feature branch
2. **Create PR** to main branch
3. **Before merging**: Complete Phase 5 manual setup
4. **After merging**: Workflow will create "Version Packages" PR
5. **Test**: Create a changeset and merge to verify automation

## Testing the Workflow

To test the complete flow:

```bash
# 1. Make a change
echo "test" > test.txt

# 2. Create changeset
pnpm changeset
# Select packages, type (patch), description

# 3. Commit and push
git add .
git commit -m "test: verify publishing workflow"
git push

# 4. Merge to main
# GitHub Actions will create "Version Packages" PR

# 5. Merge "Version Packages" PR
# Packages will be published to NPM and PyPI
```
