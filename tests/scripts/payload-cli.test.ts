// The Payload CLI stalls on Node 20 unless it runs with a resolution condition
// that steers Lexical past its top-level-await shims. `scripts/payload-cli.mjs`
// has the full account; these are the two facts that fix rests on, pinned so
// that neither can stop being true quietly.
//
// A regression here does not fail loudly on its own. The CLI exits 0 having
// done nothing, so `migrate:db` falls back to retrying and the CI drift check —
// `migrate:db:create --skip-empty`, which writes nothing when nothing changed —
// passes for a schema change it never looked at.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function read(file: string): string {
  return readFileSync(resolve(root, file), 'utf8')
}

const scripts = (
  JSON.parse(read('package.json')) as { scripts: Record<string, string> }
).scripts

describe('every way into the Payload CLI carries the condition', () => {
  it('runs the schema scripts through the launcher', () => {
    for (const name of [
      'payload',
      'generate:types',
      'migrate:db:create',
      'migrate:db:status',
      'migrate:db:down',
    ]) {
      expect(scripts[name], name).toMatch(/^node scripts\/payload-cli\.mjs\b/)
    }
  })

  it('runs migrations through the checked runner, which uses it', () => {
    expect(scripts['migrate:db']).toBe('node scripts/run-migrations.mjs')
    expect(read('scripts/run-migrations.mjs')).toMatch(/env: payloadCliEnv\(\)/)
  })

  it('has no script that calls the bare CLI', () => {
    for (const [name, command] of Object.entries(scripts)) {
      expect(command, name).not.toMatch(/(^|&&\s*)payload\s/)
    }
    expect(read('scripts/generate-importmap.mjs')).toMatch(
      /env: payloadCliEnv\(\)/,
    )
  })
})

/**
 * The package the rich-text adapter actually resolves, found from its main
 * entry because the packages export nothing but `.`.
 */
function lexicalManifest(pkg: string): {
  exports: Record<string, { import: Record<string, string> }>
} {
  const fromAdapter = createRequire(
    createRequire(resolve(root, 'package.json')).resolve(
      '@payloadcms/richtext-lexical',
    ),
  )
  for (let dir = dirname(fromAdapter.resolve(pkg)); ; dir = dirname(dir)) {
    const file = resolve(dir, 'package.json')
    try {
      const manifest = JSON.parse(readFileSync(file, 'utf8'))
      if (manifest.name === pkg) return manifest
    } catch {
      // No manifest at this level; keep climbing.
    }
    if (dirname(dir) === dir) throw new Error(`no package.json for ${pkg}`)
  }
}

describe("Lexical's exports still let a condition skip the shim", () => {
  // Node takes the first listed condition that matches. If `node` ever moves
  // above these two, the launcher's flag stops choosing anything and the stall
  // comes back.
  it.each(['lexical', '@lexical/utils', '@lexical/headless'])(
    '%s lists development and production ahead of node',
    (pkg) => {
      const keys = Object.keys(lexicalManifest(pkg).exports['.']!.import)
      expect(keys).toContain('node')
      expect(keys.indexOf('development')).toBeGreaterThanOrEqual(0)
      expect(keys.indexOf('development')).toBeLessThan(keys.indexOf('node'))
      expect(keys.indexOf('production')).toBeGreaterThanOrEqual(0)
      expect(keys.indexOf('production')).toBeLessThan(keys.indexOf('node'))
    },
  )
})
