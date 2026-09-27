import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * The admin is always in Payload's dark theme, and nothing repaints it.
 *
 * Payload wraps all of its CSS in `@layer payload-default`. Unlayered rules
 * beat layered ones regardless of specificity, so any `--theme-*` declaration
 * in `custom.css` overrides Payload's dark theme — which is how the admin once
 * turned paper-beige.
 */

const CSS = readFileSync(
  path.resolve(process.cwd(), 'app/(payload)/custom.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

describe('admin theme', () => {
  it("is forced to Payload's dark theme", async () => {
    expect((await config).admin.theme).toBe('dark')
  })

  it('custom.css sets none of Payload’s theme variables', () => {
    expect(CSS).not.toMatch(/--theme-[\w-]+\s*:/)
  })
})
