#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const corePackagePath = path.join(__dirname, '../packages/core/package.json');
const pyprojectPath = path.join(__dirname, '../packages/python/pyproject.toml');

// Read and parse core package.json
let corePackage;
try {
  const coreContent = fs.readFileSync(corePackagePath, 'utf8');
  corePackage = JSON.parse(coreContent);
} catch (err) {
  console.error(`Failed to read core package.json at ${corePackagePath}: ${err.message}`);
  process.exit(1);
}

// Validate version exists
const version = corePackage.version;
if (!version) {
  console.error('No version field found in core package.json');
  process.exit(1);
}

// Read pyproject.toml
let pyproject;
try {
  pyproject = fs.readFileSync(pyprojectPath, 'utf8');
} catch (err) {
  console.error(`Failed to read pyproject.toml at ${pyprojectPath}: ${err.message}`);
  process.exit(1);
}

// Replace version
const originalPyproject = pyproject;
pyproject = pyproject.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${version}"`
);

// Verify replacement occurred
if (pyproject === originalPyproject) {
  console.warn('Warning: No version line was replaced in pyproject.toml. The file may not contain a version field.');
}

// Write updated pyproject.toml
try {
  fs.writeFileSync(pyprojectPath, pyproject);
  console.log(`Synced Python version to ${version}`);
} catch (err) {
  console.error(`Failed to write pyproject.toml: ${err.message}`);
  process.exit(1);
}
