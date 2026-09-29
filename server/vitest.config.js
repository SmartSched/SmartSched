import { defineConfig } from 'vitest/config';

// The server's own config, so Vitest doesn't pick up the frontend one from the repo root.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
  },
});
