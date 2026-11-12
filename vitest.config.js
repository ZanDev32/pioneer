import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.js'],
          testTimeout: 2000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          testTimeout: 30000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      reporter: ['text', 'lcov'],
    },
  },
});
