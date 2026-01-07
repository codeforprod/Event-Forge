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
