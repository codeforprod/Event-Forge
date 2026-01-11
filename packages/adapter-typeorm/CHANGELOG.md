# @prodforcode/event-forge-typeorm

## 1.0.1

### Patch Changes

- fix(npm): include dist/ folder in published packages

  Added .npmignore files to all packages to ensure compiled JavaScript code
  is included in npm tarballs. Previously, packages were published with empty
  dist/ folders due to .gitignore exclusion patterns.

- Updated dependencies
  - @prodforcode/event-forge-core@1.0.1
