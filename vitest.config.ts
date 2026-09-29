import { defineConfig } from 'vitest/config';

// Frontend unit tests only. The server has its own suite: cd server && npm test.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
