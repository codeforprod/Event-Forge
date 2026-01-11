# Prompt: Fix EventForge NPM Package Publication

## Problem
The @prodforcode/event-forge-* packages (v1.0.0) on npmjs.com were published **without compiled code**. The npm tarballs only contain TypeScript source files, missing the `dist/` folder with compiled JavaScript and type declarations.

## Current Error
```bash
$ npm install @prodforcode/event-forge-core@^1.0.0
# Install succeeds

$ npm run build
error TS2307: Cannot find module '@prodforcode/event-forge-core'
# TypeScript cannot find compiled JS/types
```

## Root Cause
Packages were published using `npm publish` **before** running `npm run build`. The `.npmignore` or `files` field in package.json may also be misconfigured.

## Task: Fix and Republish EventForge Packages

### Step 1: Verify Build Configuration

Check each package's `package.json`:

```json
{
  "name": "@prodforcode/event-forge-core",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/**/*",
    "package.json",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

**Critical fields to verify:**
1. `"main"` points to `dist/index.js` (not `src/index.ts`)
2. `"types"` points to `dist/index.d.ts`
3. `"files"` includes `"dist/**/*"` (ensures dist/ is included in tarball)
4. `"prepublishOnly"` script runs build automatically before publish

### Step 2: Clean and Build All Packages

```bash
# Navigate to Event-Forge repository
cd /Users/oleksii/Projects/Node/CallAiris/Event-Forge

# Clean previous builds
rm -rf packages/*/dist
rm -rf packages/*/node_modules

# Install dependencies
npm install

# Build all packages (from workspace root)
npm run build

# OR build each package individually:
cd packages/core && npm run build
cd ../nestjs && npm run build
cd ../typeorm && npm run build
cd ../rabbitmq && npm run build
```

### Step 3: Verify Build Output

Before publishing, verify each package has compiled code:

```bash
# Check that dist/ folder exists with JS files
ls -la packages/core/dist/
# Should show: index.js, index.d.ts, and all compiled files

# Verify package contents that will be published
cd packages/core
npm pack --dry-run
# Should list dist/ files in the output
```

### Step 4: Republish to NPM

**Option A: Overwrite v1.0.0** (if npm allows):
```bash
cd packages/core
npm publish --force

cd ../nestjs
npm publish --force

cd ../typeorm
npm publish --force

cd ../rabbitmq
npm publish --force
```

**Option B: Publish as v1.0.1** (recommended):
```bash
# Update version in all package.json files
cd packages/core
npm version patch  # 1.0.0 → 1.0.1
npm publish

cd ../nestjs
npm version patch
npm publish

cd ../typeorm
npm version patch
npm publish

cd ../rabbitmq
npm version patch
npm publish
```

**Option C: Publish with next tag** (if v1.0.0 cannot be overwritten):
```bash
cd packages/core
npm publish --tag next

cd ../nestjs
npm publish --tag next

cd ../typeorm
npm publish --tag next

cd ../rabbitmq
npm publish --tag next
```

### Step 5: Verify Published Packages

After publishing, verify the packages on npm contain compiled code:

```bash
# Download and inspect published package
npm pack @prodforcode/event-forge-core@latest
tar -xzf prodforcode-event-forge-core-*.tgz
ls -la package/dist/
# Should show compiled JS and .d.ts files

# Clean up
rm -rf package prodforcode-event-forge-core-*.tgz
```

## Checklist

- [ ] Verified `package.json` in each package has correct `main`, `types`, `files` fields
- [ ] Added `"prepublishOnly": "npm run build"` script
- [ ] Ran `npm run build` in each package
- [ ] Verified `dist/` folder exists with compiled JS and .d.ts files
- [ ] Tested `npm pack --dry-run` to verify package contents
- [ ] Published all 4 packages (@prodforcode/event-forge-*)
- [ ] Verified published packages on npmjs.com contain dist/ folder

## Expected Result

After fixing and republishing:
- ✅ `npm install @prodforcode/event-forge-core` includes compiled JS
- ✅ TypeScript can resolve module imports
- ✅ CallAiris-Backend builds successfully
- ✅ All 67 tests pass
- ✅ CI/CD pipeline succeeds

## Files to Check in EventForge Repository

```
packages/core/package.json
packages/nestjs/package.json
packages/typeorm/package.json
packages/rabbitmq/package.json
packages/core/tsconfig.json
packages/nestjs/tsconfig.json
packages/typeorm/tsconfig.json
packages/rabbitmq/tsconfig.json
.npmignore (if exists - remove or configure properly)
```

---

**Note**: If using monorepo with Lerna/Turborepo, ensure the workspace build script builds all packages in correct dependency order before publishing.
