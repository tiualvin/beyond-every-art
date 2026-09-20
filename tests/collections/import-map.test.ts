import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * Every custom component the config names must be in the import map.
 *
 * `docs/DEPLOYMENT_STATUS.md` records what this costs when it is not: an import
 * map generated on a machine where S3 was unset was complete for that machine
 * and missing a handler on the server, and the admin rendered blank from 22 to
 * 31 August. The panel is a server component on the first screen after login,
 * so a missing entry here has the same shape — a CMS that will not paint, with
 * nothing in the build to say why.
 *
 * There is a second way to get there now. `payload generate:importmap` writes
 * `importMap.js`, while this project tracks `importMap.ts`, and Next resolves
 * `.ts` first — so running the generator produces a file that looks like the
 * answer, is not loaded, and leaves the tracked map stale. The `.js` is deleted
 * rather than kept; this test is what notices if the two ever disagree again.
 */

const MAP = readFileSync(
  path.resolve(process.cwd(), 'app/(payload)/admin/importMap.ts'),
  'utf8',
)

/** Component paths this repository owns, as the config spells them. */
function ownComponentPaths(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('/components/')) found.push(value)
    return found
  }
  if (Array.isArray(value)) {
    for (const entry of value) ownComponentPaths(entry, found)
    return found
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) ownComponentPaths(entry, found)
  }
  return found
}

describe('admin import map', () => {
  it('carries every component the config names', async () => {
    const resolved = await config
    const paths = ownComponentPaths(resolved.admin?.components)

    // A guard on the guard: if the config stops naming any custom component,
    // this test would pass by having nothing to check.
    expect(paths.length).toBeGreaterThan(0)

    for (const componentPath of paths) {
      expect(MAP).toContain(componentPath)
    }
  })

  it('is the only import map, so the generated one cannot shadow it', () => {
    // `.ts` wins in Next's resolution order, which makes a stray generated
    // `.js` invisible rather than loud.
    expect(() =>
      readFileSync(
        path.resolve(process.cwd(), 'app/(payload)/admin/importMap.js'),
      ),
    ).toThrow()
  })
})
