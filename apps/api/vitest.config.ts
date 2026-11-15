import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ['./test/setup-global.ts'],
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:nexo@localhost:5432/nexo_test',
      NODE_ENV: 'test',
    },
  },
});
