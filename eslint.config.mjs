import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  {
    ignores: [
      '.claude/**',
      '.next/**',
      // The companion app is a separate Expo project with its own lint config,
      // its own React Native rules and its own dependencies; linting it with
      // Next's rules from here would resolve its imports against the website's
      // node_modules. See docs/COMPANION_APP.md.
      'apps/**',
      'coverage/**',
      // Payload generates these, including the unused `payload`/`req` handler
      // arguments its template always emits. `pnpm typecheck` still covers them.
      'migrations/**',
      // Next.js writes this one and says so at the top of it. From 15.5 it
      // emits a triple-slash reference to the generated route types, which
      // `next/typescript` then objects to — an unfixable lint error, since
      // editing the file only means the next build restores it.
      'next-env.d.ts',
      'node_modules/**',
      'payload-types.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
