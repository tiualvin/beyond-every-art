// The wash on an imageless listing plate, checked against the stylesheet that
// has to let it paint.
//
// `.plate-wash` sets one property — `background-image` — and it is declared
// early in `app/globals.css`, above the site header. `.latest__plate` and
// `.entry__thumb` are declared much later. Both carry the same specificity, so
// source order decides, and the `background` shorthand resets `background-image`
// to `none`. Writing `background: var(--color-paper)` in either of those rules
// therefore silently erases the wash while leaving the markup, the custom
// property and every unit test intact — the class is applied, the pigment is
// computed, and the plate renders as an empty paper-coloured box.
//
// That is exactly what happened on the first pass, and only a screenshot caught
// it. This is the check that would have.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(import.meta.dirname, '../../app/globals.css'),
  'utf8',
)

/** The declarations inside one top-level rule, by selector. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped} \\{([^}]*)\\}`).exec(css)
  expect(match, `${selector} is missing from globals.css`).toBeTruthy()
  return match![1]!
}

/** Declarations, with comments stripped so a comment cannot satisfy a check. */
function declarations(selector: string): string {
  return block(selector).replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The rules that `.plate-wash` is combined with in the markup. */
const PLATE_HOSTS = ['.latest__plate', '.entry__thumb']

describe('the imageless plate wash', () => {
  it('is declared, and sets only background-image', () => {
    const wash = declarations('.plate-wash')
    expect(wash).toMatch(/background-image\s*:/)
    // A shorthand here would take a background-color with it and paint over
    // whatever the host rule set.
    expect(wash).not.toMatch(/(^|[;{\s])background\s*:/)
  })

  it.each(PLATE_HOSTS)(
    '%s sets background-color, never the shorthand',
    (selector) => {
      const rule = declarations(selector)
      expect(rule).toMatch(/background-color\s*:/)
      expect(rule).not.toMatch(/(^|[;{\s])background\s*:/)
    },
  )

  it('declares .plate-wash before the rules it is combined with', () => {
    // Same specificity, so if this order ever reverses the hosts win and the
    // wash disappears again — whatever properties they use.
    const washAt = css.indexOf('.plate-wash {')
    expect(washAt).toBeGreaterThan(-1)
    for (const selector of PLATE_HOSTS) {
      expect(css.indexOf(`${selector} {`)).toBeGreaterThan(washAt)
    }
  })
})
