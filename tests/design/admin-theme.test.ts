import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The admin's palette may only touch Payload's theme variables in light mode.
 *
 * Payload wraps all of its CSS in `@layer payload-default`. Unlayered rules
 * beat layered ones regardless of specificity, so a `--theme-*` declaration on
 * a bare `:root` in `custom.css` overrides Payload's dark theme too — which is
 * how the dark admin once turned paper-beige. Every rule that sets one must be
 * scoped to `[data-theme='light']`.
 */

const CSS = readFileSync(
  path.resolve(process.cwd(), 'app/(payload)/custom.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Top-level-enough rules: selector plus body, ignoring @media wrappers. */
function rules(css: string): Array<{ selector: string; body: string }> {
  const found: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  for (const match of css.matchAll(re)) {
    found.push({ selector: match[1].trim(), body: match[2] })
  }
  return found
}

describe('admin custom.css', () => {
  const themed = rules(CSS).filter((rule) => /--theme-[\w-]+\s*:/.test(rule.body))

  it('sets Payload theme variables somewhere', () => {
    expect(themed.length).toBeGreaterThan(0)
  })

  it("sets them only under [data-theme='light']", () => {
    for (const rule of themed) {
      for (const selector of rule.selector.split(',')) {
        expect(selector.trim()).toMatch(/\[data-theme=['"]?light['"]?\]/)
      }
    }
  })
})
