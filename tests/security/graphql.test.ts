// GraphQL stays off.
//
// Nothing asks for it — not the admin panel, not Live Preview, not the MCP
// plugin, not this repository — so the endpoint was surface with no reader.
// What it offered an anonymous-but-header-carrying caller on the CMS hostname
// was an arbitrarily shaped nested query, which is the `maxDepth` problem in
// payload.config.ts with no ceiling on shape rather than a ceiling of ten.
//
// Asserted against the config source rather than a booted Payload, for the
// reason `tests/design/import-map.test.ts` gives: a gate that needs the CMS to
// start is a gate that can quietly pass by not running. The flag is one line and
// its absence is what matters, so reading the line is enough.
//
// If GraphQL is ever genuinely needed, this test is the thing to delete — and
// deleting it should be the deliberate act, rather than the flag disappearing in
// a config reshuffle and nobody noticing the endpoint came back.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = readFileSync(
  resolve(import.meta.dirname, '../../payload.config.ts'),
  'utf8',
)

describe('the Payload GraphQL endpoint', () => {
  it('is disabled in the config', () => {
    // Whitespace-tolerant, because Prettier owns the formatting of this line
    // and a reflow must not read as the flag being gone.
    expect(config).toMatch(/graphQL:\s*\{\s*disable:\s*true\s*,?\s*\}/)
  })

  it('is not re-enabled by a second, later declaration', () => {
    // `buildConfig` takes one object, so a duplicate key would silently win.
    const declarations = config.match(/^\s*graphQL:/gm) ?? []
    expect(declarations).toHaveLength(1)
  })
})
