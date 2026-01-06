const base = require('../../jest.config.base');

module.exports = {
  ...base,
  displayName: '@event-forge/inbox-outbox-nestjs',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
};
