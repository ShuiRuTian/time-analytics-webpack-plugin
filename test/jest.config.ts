import { JestConfigWithTsJest } from 'ts-jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import { compilerOptions } from './tsconfig.json';

const config: JestConfigWithTsJest =
{
  /** jest */
  globalSetup: './test/jest.setup.ts',
  globalTeardown: './test/jest.teardown.ts',
  testTimeout: 20_000, // webpack might be time cosuming, leave enough time.

  /** ts-jest */
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePaths: [compilerOptions.baseUrl], // <-- This will be set to 'baseUrl' value
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths /*, { prefix: '<rootDir>/' } */),
};

export default config;