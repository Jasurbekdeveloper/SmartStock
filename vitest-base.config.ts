import { defineConfig } from 'vitest/config';

// Merged into the Angular unit-test builder's own Vitest config (angular.json → runnerConfig).
export default defineConfig({
  test: {
    // Each worker loads jsdom + Angular; too many at once ran a slower PC out of memory
    // ("Worker exited unexpectedly"). Two is enough for this suite.
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
