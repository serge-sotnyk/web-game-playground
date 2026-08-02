import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the tests exercise the pure game
// modules only, so they need neither the PWA plugin nor a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
