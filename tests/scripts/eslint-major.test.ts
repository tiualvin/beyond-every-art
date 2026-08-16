// Why ESLint is held on its 9.x line.
//
// Dependabot offers 10.8.1. On it, `pnpm lint` does not report lint errors — it
// fails to start: `eslint-config-next@15.5.23` loads through
// `@rushstack/eslint-patch`, which refuses an ESLint it does not recognise
// ("Failed to patch ESLint because the calling module was not recognized"), and
// eslint exits 2 before reading a single file. The config's own peer range says
// as much: `^7.23.0 || ^8.0.0 || ^9.0.0`.
//
// The config release that accepts ESLint 10 is `eslint-config-next@16`, which
// is Next 16's config and carries Next 16's rules. This project is on Next
// 15.5.23, so the upgrade is a framework major, not a dev-dependency bump.
//
// Retiring this: when `next` moves to 16, move `eslint-config-next` with it —
// the first test below is what enforces that pairing — and ESLint 10 comes free
// with it. Then delete this file.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe('ESLint stays on the major its Next config supports', () => {
  // These two ship as a pair: the config bundles the plugin versions and rules
  // that match a given Next release, so a skew between them is how the lint
  // rules stop describing the framework actually in use.
  it('keeps eslint-config-next level with next', () => {
    expect(packageJson.devDependencies['eslint-config-next']).toBe(
      packageJson.dependencies.next,
    )
  })

  it('pins eslint to 9.x', () => {
    expect(packageJson.devDependencies.eslint).toMatch(/^\^?9\./)
  })

  it('still has a Next config that stops at 9, or this pin is retirable', () => {
    const config = JSON.parse(
      readFileSync(
        resolve(root, 'node_modules/eslint-config-next/package.json'),
        'utf8',
      ),
    ) as { peerDependencies: { eslint: string } }

    // The top of the supported range. When this stops being 9, ESLint 10 is
    // available and the pin above can go.
    expect(config.peerDependencies.eslint.trim()).toMatch(/\^9\.0\.0$/)
  })
})
