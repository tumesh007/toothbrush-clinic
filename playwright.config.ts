import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['test-*.spec.ts'],
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:5173',
  },
});
