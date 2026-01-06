const base = require('../../jest.config.base');

module.exports = {
  ...base,
  displayName: '@event-forge/inbox-outbox-typeorm',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/integration.skip/'],
  testTimeout: 30000, // Integration tests may take longer
};
