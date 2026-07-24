import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Mirror the tsconfig path aliases so Vitest resolves them the same way the app
// and Payload do, regardless of Node version or module type.
export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': fileURLToPath(
        new URL('./payload.config.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: { coverage: { reporter: ['text', 'json'] } },
})
