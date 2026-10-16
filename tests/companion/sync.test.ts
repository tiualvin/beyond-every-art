// The companion app's generated files, held to the sources they come from.
//
// The app cannot import from the website — it is a separate Expo project, not a
// workspace package (docs/COMPANION_APP.md) — so what it shares is written into
// `apps/companion/src/generated/` by `pnpm companion:sync`. A generated file is
// only as good as its last run, which is what this checks: change a block slug
// or a brand colour without re-running the sync and this fails, naming the
// command, before the app and the website disagree about either.

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BLOCK_SLUGS } from '../../blocks/schema'
import {
  readRootProperties,
  renderCompanionFiles,
  resolveColour,
} from '../../scripts/companion-sync'

const root = resolve(import.meta.dirname, '../..')

const readOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

describe('generated companion files', () => {
  it.each(renderCompanionFiles(root))(
    '$path is current — run `pnpm companion:sync` if not',
    ({ path, contents }) => {
      expect(readOrNull(join(root, path))).toBe(contents)
    },
  )

  it('carries every block slug the website renders', () => {
    const file = renderCompanionFiles(root).find((generated) =>
      generated.path.endsWith('block-slugs.ts'),
    )
    for (const slug of BLOCK_SLUGS) {
      expect(file?.contents).toContain(JSON.stringify(slug))
    }
  })
})

describe('brand tokens', () => {
  const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
  const properties = readRootProperties(css)

  it('reads both top-level :root blocks', () => {
    // The palette at the top of the file, and the pigments much further down.
    expect(properties.get('--color-paper')).toBe('#f6f2eb')
    expect(properties.get('--pig-viridian')).toBe('#2e6b52')
  })

  it('skips the :root inside a media query', () => {
    // That one sets the phone masthead height; the top-level value is 4.75rem.
    expect(properties.get('--masthead-h')).toBe('4.75rem')
  })

  it('resolves var() through another custom property', () => {
    const chain = new Map([
      ['--a', 'var(--b)'],
      ['--b', '#ABC'],
    ])
    expect(resolveColour('var(--a)', chain)).toBe('#aabbcc')
  })

  it('refuses a var() cycle rather than looping', () => {
    const cycle = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ])
    expect(resolveColour('var(--a)', cycle)).toBeNull()
  })

  it('mixes in sRGB the way CSS Color 5 does', () => {
    // --color-rule: 26% ink into paper. Channel by channel,
    // round(27×.26 + 246×.74) = 189, round(23×.26 + 242×.74) = 185,
    // round(20×.26 + 235×.74) = 179.
    expect(resolveColour(properties.get('--color-rule')!, properties)).toBe(
      '#bdb9b3',
    )
  })

  it('takes a missing percentage as the remainder, and both missing as half', () => {
    const colours = new Map<string, string>()
    expect(resolveColour('color-mix(in srgb, #000 25%, #fff)', colours)).toBe(
      resolveColour('color-mix(in srgb, #000, #fff 75%)', colours),
    )
    expect(resolveColour('color-mix(in srgb, #000, #fff)', colours)).toBe(
      '#808080',
    )
  })

  it('omits a mix with transparency rather than approximating it', () => {
    expect(
      resolveColour('color-mix(in srgb, #000 20%, #fff 30%)', new Map()),
    ).toBeNull()
  })

  it('omits what is not a colour, and says so in the file', () => {
    const tokens = renderCompanionFiles(root).find((generated) =>
      generated.path.endsWith('brand-tokens.ts'),
    )!.contents
    for (const name of ['--font-serif', '--font-sans', '--plate-wash']) {
      expect(tokens).toContain(JSON.stringify(name))
    }
  })
})
