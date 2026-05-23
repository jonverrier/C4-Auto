/**
 * Jest configuration for C4-Auto tests.
 */
// Copyright (c) 2025, 2026 Jon Verrier

/** @type {import('jest').Config} */
const tsJestTransform = {
   '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
   '\\.md$': '<rootDir>/test/md-transform.js'
};

/** @type {import('jest').Config} */
module.exports = {
   projects: [
      {
         displayName: 'unit',
         preset: 'ts-jest',
         testEnvironment: 'node',
         roots: ['<rootDir>/test'],
         testMatch: [
            '**/DirectoryTreeTraverser.test.ts',
            '**/ModuleHeaderVisitor.test.ts',
            '**/C4DiagramVisitor.test.ts',
            '**/RollupC4Visitor.test.ts',
            '**/C4ReadmeUtils.test.ts',
            '**/generate-docs-cli.test.ts'
         ],
         transform: tsJestTransform,
         collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
         setupFilesAfterEnv: ['<rootDir>/test/setup/jest.timeout.unit.js']
      },
      {
         displayName: 'ci',
         preset: 'ts-jest',
         testEnvironment: 'node',
         roots: ['<rootDir>/test'],
         testMatch: [
            '**/DirectoryTreeTraverser.test.ts',
            '**/ModuleHeaderVisitor.test.ts',
            '**/C4DiagramVisitor.test.ts',
            '**/RollupC4Visitor.test.ts',
            '**/C4ReadmeUtils.test.ts',
            '**/generate-docs-cli.test.ts',
            '**/DocumentationGenerator.integration.test.ts'
         ],
         transform: tsJestTransform,
         setupFilesAfterEnv: ['<rootDir>/test/setup/jest.timeout.ci.js']
      },
      {
         displayName: 'integration',
         preset: 'ts-jest',
         testEnvironment: 'node',
         roots: ['<rootDir>/test'],
         testMatch: ['**/DocumentationGenerator.integration.test.ts'],
         transform: tsJestTransform,
         setupFilesAfterEnv: ['<rootDir>/test/setup/jest.timeout.integration.js']
      },
      {
         displayName: 'e2e',
         preset: 'ts-jest',
         testEnvironment: 'node',
         roots: ['<rootDir>/test'],
         testMatch: ['**/DocumentationGenerator.e2e.test.ts'],
         transform: tsJestTransform,
         setupFilesAfterEnv: ['<rootDir>/test/setup/jest.timeout.e2e.js'],
         maxWorkers: 1
      }
   ]
};
