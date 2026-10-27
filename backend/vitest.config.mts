import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setupEnv.ts'],
    // All suites share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
