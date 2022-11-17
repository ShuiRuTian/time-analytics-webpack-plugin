import { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest =
{
  /** jest */
  globalSetup: './jest.setup.ts',
  globalTeardown: './jest.teardown.ts',
  testTimeout: 600_000, // webpack might be time cosuming, leave enough time.

  /** ts-jest */
  preset: 'ts-jest',
  testEnvironment: 'node',
};

export default config;