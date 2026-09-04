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

  // Centred, the image starts below the title and its credit finishes level
  // with the rule above the byline, which reads as a misalignment rather than
  // a choice. Top-aligned, both clear that rule and the columns start together.
  it('aligns the image to the top of the row rather than floating it', () => {
    const rule = /\.article__hero \{([^}]*)\}/.exec(css)
    expect(rule, '.article__hero is missing from globals.css').toBeTruthy()
    expect(rule![1]).toMatch(/align-items: start/)
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

  // The reservation is the unit and a gap. At the module rhythm it was the
  // unit and a second band — 290px of nothing above "More on this" — and those
  // 16px were also 16px the newsletter card did not have.
  it('reserves the unit and a gap, not the unit and a band', () => {
    const slot = /\.rail__slot \{([^}]*)\}/.exec(css)
    const mod = /\.rail__mod \{([^}]*)\}/.exec(css)
    expect(slot, '.rail__slot is missing from globals.css').toBeTruthy()
    expect(mod, '.rail__mod is missing from globals.css').toBeTruthy()

    const gap = (rule: string) =>
      px(/margin-bottom: ([\d.]+rem)/.exec(rule)![1])

    expect(gap(slot![1])).toBeLessThan(gap(mod![1]))
  })

  it('clears the masthead when it sticks', () => {
    expect(css).toMatch(
      /\.rail__sticky \{[\s\S]*?top: calc\(var\(--masthead-h\)/,
    )
  })

  // This was once behind `@media (min-height: 820px)` and the guard was the
  // bug. The group is about 700px tall, and a laptop at 1440×900 has roughly
  // 800px of viewport once browser chrome is taken off — so on most windows
  // there was no sticky at all, and it looked like the feature had never been
  // built.
  it('sticks at every window height', () => {
    expect(css).not.toMatch(
      /@media \(min-height: [^)]+\)[\s\S]{0,300}?\.rail__sticky/,
    )
    const rule = /\.rail__sticky \{([^}]*)\}/.exec(css)
    expect(rule, '.rail__sticky is missing from globals.css').toBeTruthy()
    expect(rule![1]).toMatch(/position: sticky/)
  })

  // What the height guard was protecting against, closed properly: a sticky
  // box taller than the space it pins into hangs its bottom off the screen
  // where nothing can scroll to it.
  it('is never taller than the space it pins into', () => {
    const rule = /\.rail__sticky \{([^}]*)\}/.exec(css)
    expect(rule![1]).toMatch(/max-height: calc\(100dvh/)
    expect(rule![1]).toMatch(/overflow-y: auto/)
  })

  // Capping the group and scrolling it whole made the newsletter card — the
  // last thing in it, and the only thing in it a reader is meant to act on —
  // the first thing off the bottom, on every window under about 845px of
  // viewport. So the group is a column and only one module in it may shrink.
  it('gives the related list rather than the newsletter card', () => {
    const sticky = /\.rail__sticky \{([^}]*)\}/.exec(css)
    expect(sticky![1]).toMatch(/display: flex/)
    expect(sticky![1]).toMatch(/flex-direction: column/)

    // Everything holds its height...
    expect(css).toMatch(/\.rail__sticky > \* \{\s*flex: none;\s*\}/)

    // ...except the list. `0 1` and not `1 1`: it may shrink, but growing into
    // the space left over on a tall window would push the card to the bottom
    // of the box with a gap above it.
    const related = /\.rail__sticky > \.rail__related \{([^}]*)\}/.exec(css)
    expect(related, '.rail__related is missing from globals.css').toBeTruthy()
    expect(related![1]).toMatch(/flex: 0 1 auto/)
    expect(related![1]).toMatch(/min-height: 0/)

    const list = /\.rail__related \.rail__list \{([^}]*)\}/.exec(css)
    expect(list, 'the related list is not the module that scrolls').toBeTruthy()
    expect(list![1]).toMatch(/min-height: 0/)
    expect(list![1]).toMatch(/overflow-y: auto/)
  })

  // Under 650px of viewport the list has nothing whole left to show and becomes
  // a sliver under a heading, which reads as broken rather than tight. Note
  // this is a `max-height`: it drops one supplementary module on the windows
  // that cannot hold it, where the `min-height` guard above turned the whole
  // feature off on most windows.
  it('drops the list rather than showing a sliver of it', () => {
    expect(css).toMatch(
      /@media \(max-height: \d+px\) \{\s*\.rail__sticky > \.rail__related \{\s*display: none;/,
    )
  })

  // The threshold is the thing that goes wrong quietly. It shipped at 700px,
  // which is above a large share of real windows — a laptop with a bookmarks
  // bar sits just under it — so the module vanished for them and looked like a
  // bug rather than a decision. Measured in Chromium against the current
  // spacing, one whole related item survives to 650. A threshold above that is
  // hiding the module from windows that could have held it.
  it('hides the list only where the geometry says it cannot fit', () => {
    const guard =
      /@media \(max-height: (\d+)px\) \{\s*\.rail__sticky > \.rail__related/.exec(
        css,
      )
    expect(
      guard,
      'the short-window guard is missing from globals.css',
    ).toBeTruthy()
    expect(Number(guard![1])).toBeLessThanOrEqual(650)
  })

  // The elastic module is the related one, and the stylesheet can only know
  // that if the component says so.
  it('marks the related module as the one that gives', () => {
    const rail = readFileSync(
      resolve(
        import.meta.dirname,
        '../../app/(frontend)/components/article-rail.tsx',
      ),
      'utf8',
    )
    expect(rail).toMatch(/className="rail__mod rail__related"/)
    // One module carries it, and it is not the newsletter card.
    expect(rail.match(/className="[^"]*rail__related[^"]*"/g)!.length).toBe(1)
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
