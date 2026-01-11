# CI/CD Implementation Task: NPM + PyPI Publishing

## Objective

Set up automated CI/CD pipeline for Event-Forge monorepo to publish:
- **5 NPM packages** (`@event-forge/inbox-outbox-core`, `@event-forge/inbox-outbox-typeorm`, `@event-forge/inbox-outbox-mongoose`, `@event-forge/inbox-outbox-rabbitmq`, `@event-forge/inbox-outbox-nestjs`)
- **1 PyPI package** (`event-forge-inbox-outbox`)

Publishing should trigger automatically when changes are merged to `main` branch.

---

## Architecture Decision: Changesets + Trusted Publishers

**NPM**: Use [Changesets](https://github.com/changesets/changesets) for version management
- Decouples versioning from commits
- Auto-generates CHANGELOG
- Creates version bump PR automatically
- Handles monorepo inter-package dependencies

**PyPI**: Use [Trusted Publishers](https://docs.pypi.org/trusted-publishers/) (OIDC)
- No manual API tokens required
- Automatic attestations (PEP 740)
- More secure than token-based auth

---

## Implementation Steps

### Phase 1: Install and Configure Changesets

1. Install Changesets CLI:
```bash
pnpm add -Dw @changesets/cli
pnpm changeset init
```

2. Configure `.changeset/config.json`:
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@event-forge/inbox-outbox-*"]
  ],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

3. Add scripts to root `package.json`:
```json
{
  "scripts": {
    "changeset": "changeset",
    "version-packages": "changeset version",
    "ci:publish": "pnpm publish -r --access public --no-git-checks",
    "release": "pnpm build && pnpm ci:publish"
  }
}
```

---

### Phase 2: Create Version Sync Script

Create `scripts/sync-python-version.js` to sync version from `packages/core/package.json` to `packages/python/pyproject.toml`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const corePackagePath = path.join(__dirname, '../packages/core/package.json');
const pyprojectPath = path.join(__dirname, '../packages/python/pyproject.toml');

const corePackage = JSON.parse(fs.readFileSync(corePackagePath, 'utf8'));
const version = corePackage.version;

let pyproject = fs.readFileSync(pyprojectPath, 'utf8');
pyproject = pyproject.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${version}"`
);

fs.writeFileSync(pyprojectPath, pyproject);
console.log(`Synced Python version to ${version}`);
```

Add to root `package.json`:
```json
{
  "scripts": {
    "sync-versions": "node scripts/sync-python-version.js"
  }
}
```

---

### Phase 3: Create GitHub Actions Workflows

**File: `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches:
      - main

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    name: Create Release PR or Publish NPM
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    outputs:
      published: ${{ steps.changesets.outputs.published }}
      publishedPackages: ${{ steps.changesets.outputs.publishedPackages }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build all packages
        run: pnpm run build

      - name: Run tests
        run: pnpm test

      - name: Sync Python version
        run: pnpm run sync-versions

      - name: Create Release PR or Publish
        id: changesets
        uses: changesets/action@v1
        with:
          commit: "chore(release): version packages"
          title: "chore(release): version packages"
          publish: pnpm ci:publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-python:
    name: Publish Python to PyPI
    needs: release
    if: needs.release.outputs.published == 'true'
    runs-on: ubuntu-latest
    environment:
      name: pypi
      url: https://pypi.org/p/event-forge-inbox-outbox
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install build tools
        run: python -m pip install --upgrade pip build

      - name: Build Python package
        working-directory: packages/python
        run: python -m build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: packages/python/dist/
          attestations: true
```

---

### Phase 4: PyPI Trusted Publisher Configuration

**On PyPI (https://pypi.org):**

1. Create account if not exists
2. Create new project `event-forge-inbox-outbox` or configure existing
3. Go to Project Settings -> Publishing
4. Add Trusted Publisher:
   - **Owner**: `<github-org-or-username>`
   - **Repository**: `Event-Forge`
   - **Workflow name**: `release.yml`
   - **Environment**: `pypi`

**On GitHub:**

1. Go to Repository Settings -> Environments
2. Create environment named `pypi`
3. Add protection rules (optional but recommended):
   - Required reviewers for production releases
   - Deployment branches: `main` only

---

### Phase 5: NPM Token Configuration

**On NPM (https://www.npmjs.com):**

1. Login to npm account
2. Go to Access Tokens -> Generate New Token
3. Select "Automation" token type (for CI/CD)
4. Copy token

**On GitHub:**

1. Go to Repository Settings -> Secrets and variables -> Actions
2. Create secret `NPM_TOKEN` with the automation token

---

### Phase 6: Update Existing Workflows

**Keep `.github/workflows/ci.yml`** for PR validation (already exists).

**Delete or rename `.github/workflows/publish.yml`** (replaced by release.yml).

---

## Workflow Summary

```
Developer Flow:
1. Make changes
2. Run `pnpm changeset` -> describe changes (major/minor/patch)
3. Commit changeset file with PR
4. Merge PR to main

Automation Flow:
1. Push to main triggers release.yml
2. Changesets action:
   - If changesets exist -> creates "Version Packages" PR
   - If version PR merged -> publishes to NPM
3. If NPM published -> triggers Python build + PyPI publish
```

---

## Required Secrets

| Secret | Source | Purpose |
|--------|--------|---------|
| `NPM_TOKEN` | npmjs.com | NPM package publishing |
| `GITHUB_TOKEN` | Auto-provided | PR creation, releases |
| *(none for PyPI)* | Trusted Publisher OIDC | PyPI publishing |

---

## Required GitHub Environments

| Environment | Purpose | Protection |
|-------------|---------|------------|
| `pypi` | PyPI publishing | Optional: required reviewers |

---

## Verification Checklist

- [ ] Changesets initialized (`.changeset/` directory exists)
- [ ] Config file `.changeset/config.json` created
- [ ] Version sync script works
- [ ] `release.yml` workflow created
- [ ] NPM_TOKEN secret configured
- [ ] PyPI trusted publisher configured
- [ ] GitHub `pypi` environment created
- [ ] Old `publish.yml` removed/renamed
- [ ] Test with dry-run changeset

---

## Sources

- [Changesets GitHub](https://github.com/changesets/changesets)
- [Using Changesets with pnpm](https://pnpm.io/using-changesets)
- [Complete Monorepo Guide 2025](https://jsdev.space/complete-monorepo-guide/)
- [PyPI Trusted Publishers](https://docs.pypi.org/trusted-publishers/)
- [PyPI Publishing Guide](https://packaging.python.org/en/latest/guides/publishing-package-distribution-releases-using-github-actions-ci-cd-workflows/)
- [gh-action-pypi-publish](https://github.com/pypa/gh-action-pypi-publish)
- [Changesets Action](https://github.com/changesets/action)
