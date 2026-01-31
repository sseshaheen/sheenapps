/**
 * Jest configuration for migration integration tests
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: [
    '**/__tests__/migration*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageDirectory: 'coverage/migration',
  collectCoverageFrom: [
    'src/services/migration*.ts',
    'src/services/enterpriseMigrationService.ts',
    'src/routes/migration.ts',
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.migration.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
  detectOpenHandles: true,
  forceExit: true
};