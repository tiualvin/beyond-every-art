// The placeholder a listing shows where a featured image should have been.
//
// Four of the five most recent published pieces carry no `featuredImage` — the
// Ghost editor's picker went away with the cutover and nothing has replaced it
// (`docs/STOCK_IMAGERY.md`). Those are the pieces the homepage puts at the top,
// so the placeholder is not an edge case here, it is what most of the opening
// renders.
//
// It is one gradient, held in `--plate-wash`, and every surface that needs it
// refers to that token. An earlier pass gave each piece a wash drawn from its
// own subject's pigment; that was dropped deliberately, because a per-piece
// colour makes a missing image look like a design decision. It is not one —
// every article here is meant to carry an image, and a missing one is an
// omission to go and fix.
//
// Two separate traps are pinned below, and both have bitten:
//
//  - `.plate-wash` sets `background-image`, and the rules it is combined with
//    are declared later in the sheet at equal specificity. A `background`
//    shorthand in either of those resets `background-image` to `none`, which
//    silently erases the wash while leaving the markup, the class and every
//    other test intact. Only a screenshot caught it the first time.
//  - Three surfaces show this placeholder. When each carried its own gradient,
//    "similar" was doing the work that "the same" should have been.

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
  // Anchored to the start of a line: `.story-card--horizontal .story-card__thumb`
  // would otherwise answer for `.story-card__thumb`, and a compound selector
  // carries only the overrides, never the base rule's declarations.
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)
  expect(match, `${selector} is missing from globals.css`).toBeTruthy()
  return match![1]!
}

/** Declarations, with comments stripped so a comment cannot satisfy a check. */
function declarations(selector: string): string {
  return block(selector).replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The rules `.plate-wash` is combined with in the markup. */
const PLATE_HOSTS = ['.latest__plate', '.entry__thumb']

/** Every rule that paints the placeholder, including the card grid's own. */
const PLACEHOLDER_SURFACES = ['.plate-wash', '.story-card__thumb']

describe('the missing-image placeholder', () => {
  it('is one gradient, defined once', () => {
    const root = declarations(':root')
    expect(root).toMatch(/--plate-wash:\s*linear-gradient\(/)
  })

  it('is burgundy, not a per-piece colour', () => {
    // The whole point of dropping `plateFor` was that the placeholder should
    // read as an omission in the brand's own voice, not as a chosen accent.
    const root = block(':root')
    const value = /--plate-wash:([^;]*);/.exec(root)
    expect(value, '--plate-wash is missing from :root').toBeTruthy()
    expect(value![1]).toContain('--color-burgundy')
    expect(value![1]).toContain('--color-dark')
  })

  it.each(PLACEHOLDER_SURFACES)('%s uses the shared token', (selector) => {
    // Not "a similar gradient" — the same one. Two hand-written gradients is
    // how the card grid and the entry list quietly stopped matching.
    expect(declarations(selector)).toContain('var(--plate-wash)')
  })

  it('sets only background-image where it is combined with another rule', () => {
    const wash = declarations('.plate-wash')
    expect(wash).toMatch(/background-image\s*:/)
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
