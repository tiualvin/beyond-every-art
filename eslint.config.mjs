import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  {
    ignores: [
      '.claude/**',
      '.next/**',
      'coverage/**',
      // Payload generates these, including the unused `payload`/`req` handler
      // arguments its template always emits. `pnpm typecheck` still covers them.
      'migrations/**',
      'node_modules/**',
      'payload-types.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
