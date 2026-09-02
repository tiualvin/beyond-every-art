// The post template's track widths, checked against the stylesheet that makes
// them true.
//
// Every number in `docs/POST_PAGE_LAYOUT.md` — the 704px measure, the width of
// the block, the box the featured image fills — is arithmetic on four custom
// properties in `app/globals.css`. That arithmetic is easy to break by nudging
// one of them: widening the measure by a rem widens the block, which quietly
// takes the gutter away at the width the rail first appears, and that is the
// difference between a page that reads as composed and one that reads as
// cramped.
//
// So the properties are read out of the stylesheet and the widths recomputed
// here. A change to the layout is meant to change this file too; a change that
// did not mean to will fail it.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(import.meta.dirname, '../../app/globals.css'),
  'utf8',
)

const REM = 16

/** The `.article__shell` declarations that apply at a given viewport width. */
function shellAt(viewport: number): Record<string, string> {
  const declarations: Record<string, string> = {}

  // The base block, then every `min-width` query at or below the viewport, in
  // source order — which is the order the cascade applies them in.
  const blocks: { at: number; body: string }[] = []

  const base = /\.article__shell \{([^}]*)\}/.exec(css)
  expect(base, '.article__shell is missing from globals.css').toBeTruthy()
  blocks.push({ at: 0, body: base![1] })

  const query =
    /@media \(min-width: ([\d.]+)rem\) \{\s*\.article__shell \{([^}]*)\}/g
  for (const match of css.matchAll(query)) {
    blocks.push({ at: Number(match[1]) * REM, body: match[2] })
  }

  for (const block of blocks) {
    if (block.at > viewport) continue
    for (const line of block.body.split(';')) {
      const [name, ...rest] = line.split(':')
      if (!name?.trim().startsWith('--')) continue
      declarations[name.trim()] = rest.join(':').trim()
    }
  }

  return declarations
}

/** The `sizes` string a component hands `next/image`. */
function sizesFrom(file: string, constant: string): string {
  const source = readFileSync(
    resolve(import.meta.dirname, '../..', file),
    'utf8',
  )
  const match = new RegExp(`const ${constant} =\\s*'([^']+)'`).exec(source)
  expect(match, `${constant} is missing from ${file}`).toBeTruthy()
  return match![1]
}

/** Which clause of a `sizes` string applies at a viewport width. */
function evaluateSizes(sizes: string, viewport: number): string {
  for (const clause of sizes.split(',').map((part) => part.trim())) {
    const query = /^\(max-width: ([\d.]+)(rem|px)\) (.+)$/.exec(clause)
    if (!query) return clause
    const at = Number(query[1]) * (query[2] === 'rem' ? REM : 1)
    if (viewport <= at) return query[3]
  }
  return ''
}

function px(value: string): number {
  const rem = /^([\d.]+)rem$/.exec(value)
  if (rem) return Number(rem[1]) * REM
  const pixels = /^([\d.]+)px$/.exec(value)
  if (pixels) return Number(pixels[1])
  throw new Error(`not a fixed length: ${value}`)
}

/**
 * What the shell resolves to at a viewport wide enough to carry the rail.
 *
 * `--shell` is deliberately not read: the stylesheet writes it as the sum of
 * the parts rather than a number, so the sum is what this recomputes.
 */
function tracks(viewport: number) {
  const shell = shellAt(viewport)
  const text = px(shell['--text-w'])
  const rail = px(shell['--rail-w'])
  const gap = px(shell['--gap'])
  const pad = px(shell['--pad'])
  const block = text + gap + rail + pad * 2

  return {
    block,
    text,
    rail,
    gap,
    pad,
    gutter: (viewport - block) / 2 + pad,
  }
}

describe('the article shell', () => {
  it('holds the reading measure at 704px, whatever the screen', () => {
    for (const viewport of [1280, 1440, 1600, 1920, 2560]) {
      expect(tracks(viewport).text).toBe(704)
    }
  })

  // Measured in Chromium at 17.6px Inter: 704px sets ~73 characters, 736px
  // sets 80 and 800px sets 88. 45–75 is the comfortable range, so 704 is the
  // widest the column can be — which is why removing the notes margin widened
  // the measure by 32px and not by the 276px the margin had.
  it('keeps the measure inside a comfortable line length', () => {
    const { text } = tracks(1440)
    expect(text).toBeGreaterThanOrEqual(640)
    expect(text).toBeLessThanOrEqual(720)
  })

  // The point of the second pass: the block is the two tracks and nothing
  // else, so there is no third column sitting empty on most articles.
  it('is exactly as wide as the text, the rail and the gap between them', () => {
    const { block, text, rail, gap, pad } = tracks(1440)
    expect(block).toBe(text + gap + rail + pad * 2)
    expect(block).toBe(1100)
  })

  it('is one width at every desktop size', () => {
    const widths = [1280, 1440, 1600, 1920, 2560].map((v) => tracks(v).block)
    expect(new Set(widths).size).toBe(1)
  })

  // The block is centred, so the gutter is what is left over. If it were as
  // wide as the breakpoint that reveals it, the text would start 24px from the
  // edge of the screen at that width.
  it('leaves a real gutter at the width the rail first appears', () => {
    expect(tracks(1280).gutter).toBeGreaterThanOrEqual(56)
  })
})

describe('the split hero', () => {
  /** The second track of `.article__hero`: what the featured image fills. */
  function heroImage(viewport: number): number {
    const { block, gap, pad } = tracks(viewport)
    const rule = /\.article__hero \{([^}]*)\}/.exec(css)
    expect(rule, '.article__hero is missing from globals.css').toBeTruthy()
    const ratio =
      /grid-template-columns:\s*minmax\(0, ([\d.]+)fr\) minmax\(0, ([\d.]+)fr\)/.exec(
        rule![1],
      )
    expect(ratio, 'the hero columns are no longer a ratio').toBeTruthy()

    const title = Number(ratio![1])
    const image = Number(ratio![2])
    return Math.round(((block - pad * 2 - gap) * image) / (title + image))
  }

  const sizes = sizesFrom(
    'app/(frontend)/components/article.tsx',
    'FIGURE_SIZES',
  )

  // A `sizes` that has stopped describing the box is the failure mode with no
  // symptom: the layout is right, the browser fetches a source too small for
  // it, and the picture is soft. It was wrong once already — both figure hints
  // still said 44rem after the column first moved.
  it('promises the browser the width the image actually gets', () => {
    for (const viewport of [1280, 1440, 1600, 1920]) {
      expect(evaluateSizes(sizes, viewport)).toBe(`${heroImage(viewport)}px`)
    }
  })

  it('is smaller than the column it sits beside', () => {
    expect(heroImage(1440)).toBeLessThan(tracks(1440).text)
  })

  it('spans both tracks, so the rail starts level with the body', () => {
    expect(css).toMatch(/\.article__hero \{\s*grid-column: 1 \/ -1;/)
  })
})

describe('media in the body', () => {
  // With the notes margin gone there is nothing to bleed into: the reading
  // column is the whole track, so a gallery row is the measure and the hint
  // has to say so.
  it('tells the browser a gallery row is the measure', () => {
    const sizes = sizesFrom(
      'app/(frontend)/components/blocks/gallery.tsx',
      'ROW_SIZES',
    )

    for (const viewport of [1152, 1280, 1440, 1920]) {
      expect(evaluateSizes(sizes, viewport)).toBe('44rem')
    }
  })
})

describe('the rail', () => {
  it('is hidden until there is room for it beside the measure', () => {
    expect(css).toMatch(/\.article__rail \{\s*display: none;/)
    expect(css).toMatch(
      /@media \(min-width: 80rem\)[\s\S]*?\.article__rail \{\s*display: block;/,
    )
  })

  it('reserves the square unit above the related pieces', () => {
    expect(css).toMatch(/\.rail__slot \{\s*min-height: 250px;/)
  })

  it('clears the masthead when it sticks', () => {
    expect(css).toMatch(
      /\.rail__sticky \{[\s\S]*?top: calc\(var\(--masthead-h\)/,
    )
  })

  // A sticky box taller than the screen pins its top and hangs its bottom off
  // the end, and nothing can scroll to the part underneath. The group is about
  // 700px with the slot filled, so it only sticks where the whole of it fits.
  it('only sticks where the whole group fits on the screen', () => {
    expect(css).toMatch(
      /@media \(min-height: \d+px\) \{\s*\.rail__sticky \{\s*position: sticky;/,
    )
  })
})

describe('the body', () => {
  it('justifies its paragraphs, with hyphenation to keep them even', () => {
    const rule = /\.prose > p \{([^}]*)\}/.exec(css)
    expect(rule, '.prose > p is missing from globals.css').toBeTruthy()
    expect(rule![1]).toMatch(/text-align: justify/)
    // Justified text with no hyphenation rivers at this measure.
    expect(rule![1]).toMatch(/hyphens: auto/)
  })
})

describe('the pages that do not get any of this', () => {
  // A Page renders through `.article__inner` and has neither a rail's worth of
  // related content nor, per docs/ADVERTISING.md, any ad slot. Leaving its
  // width alone is what keeps this change to the post template.
  it('leaves .article__inner at its original width', () => {
    expect(css).toMatch(/\.article__inner \{\s*max-width: 44rem;\s*\}/)
  })
})
