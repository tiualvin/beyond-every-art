import { fileURLToPath } from 'node:url'

import { configDefaults, defineConfig } from 'vitest/config'

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
  // `tsconfig.json` sets `jsx: preserve` because Next does its own transform.
  // Vitest has no such step, so without this every `.tsx` test file reaches
  // Node as raw JSX and fails to parse.
  esbuild: { jsx: 'automatic' },
  test: {
    coverage: { reporter: ['text', 'json'] },
    // Playwright specs have their own runner; importing them through Vitest
    // executes Playwright's test declarations outside its configured context.
    exclude: [...configDefaults.exclude, '.claude/**', 'e2e/**'],
  },
})
