const base = require('../../jest.config.base');

module.exports = {
  ...base,
  displayName: '@event-forge/inbox-outbox-typeorm',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testTimeout: 30000, // Integration tests may take longer
};
