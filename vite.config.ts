import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // Only run Vitest unit tests — exclude Playwright .spec files at the root
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'test-integration.spec.ts',
      'test-spike.spec.ts',
      '**/node_modules/**',
    ],
  },
});
