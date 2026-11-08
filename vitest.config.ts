import { defineConfig } from 'vitest/config';

// The engine is pure TypeScript: no DOM, no network, no setup files.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
