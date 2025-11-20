const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/_*.{js,jsx,ts,tsx}',
    '!src/tests/**',
    '!src/__tests__/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}

// Projects 설정: 단위 테스트(jsdom)와 통합 테스트(node) 분리
const baseJestConfig = createJestConfig(customJestConfig);

module.exports = {
  projects: [
    {
      ...baseJestConfig,
      displayName: 'unit',
      testEnvironment: 'jest-environment-jsdom',
      testMatch: [
        '<rootDir>/**/__tests__/**/*.test.[jt]s?(x)',
        '<rootDir>/**/?(*.)+(spec|test).[jt]s?(x)',
        '!<rootDir>/src/tests/**',
      ],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/tests/**/*.test.[jt]s'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      testPathIgnorePatterns: ['/node_modules/', '/.next/'],
    },
  ],
}
