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

import {
  INLINE_FIRST_WORDS,
  INLINE_GAP_WORDS,
  INLINE_MAX,
} from '@/lib/ads/inline'
import { minViewportWidth } from '@/lib/ads/placements'

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
  const rail = readFileSync(
    resolve(
      import.meta.dirname,
      '../../app/(frontend)/components/article-rail.tsx',
    ),
    'utf8',
  )

  it('is hidden until there is room for it beside the measure', () => {
    expect(css).toMatch(/\.article__rail \{\s*display: none;/)
    expect(css).toMatch(
      /@media \(min-width: 80rem\)[\s\S]*?\.article__rail \{\s*display: block;/,
    )
  })

  // The width above, in the one other place that has to know it. Hiding the
  // track does nothing to the effect inside it, so `AdUnit` asks `matchMedia`
  // before it asks Google — and it asks for the width the placement carries.
  // Move the breakpoint in the stylesheet alone and every phone goes back to
  // requesting an ad for a box it will never show.
  it('tells the ad unit the same width it hides the track at', () => {
    // The gap must not cross another `@media`, or this reads the width of an
    // earlier query and passes against a number nothing uses.
    const query =
      /@media \(min-width: ([\d.]+)rem\)(?:(?!@media)[\s\S])*?\.article__rail \{\s*display: block;/.exec(
        css,
      )
    expect(query, 'no min-width query shows .article__rail').toBeTruthy()
    expect(minViewportWidth('rail-1')).toBe(Number(query![1]) * REM)
  })

  it('reserves the square unit above the card', () => {
    expect(css).toMatch(/\.rail__slot \{\s*min-height: 250px;/)
  })

  // The reservation is the unit and a gap. At the module rhythm it was the
  // unit and a second band — 290px of nothing above the module below it — and
  // those 16px were also 16px the newsletter card did not have.
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
  // bug: on a group taller than most windows, there was no sticky at all on
  // most windows, and it looked like the feature had never been built.
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
  // where nothing can scroll to it. The ladder keeps the group under the cap
  // down to 508px of viewport; this is the backstop below that.
  it('is never taller than the space it pins into', () => {
    const rule = /\.rail__sticky \{([^}]*)\}/.exec(css)
    expect(rule![1]).toMatch(/max-height: calc\(100dvh/)
    expect(rule![1]).toMatch(/overflow-y: auto/)
  })

  // "More on this" is gone, and a deletion that leaves its stylesheet behind
  // is the kind nothing fails over: the rules keep matching nothing, the next
  // reader takes them for a module that exists, and the file grows a wing
  // nobody lives in.
  //
  // `.rail__meta` is deliberately not on this list. It came back with the ad
  // slot's house fallback, which needs exactly what it always was — a small
  // caption line under a headline in this column — so it has a live consumer
  // again rather than being a leftover.
  it('carries no trace of the related list it used to hold', () => {
    for (const selector of ['.rail__list', '.rail__item', '.rail__related']) {
      expect(css, `${selector} outlived the module it styled`).not.toContain(
        selector,
      )
    }
    expect(rail).not.toContain('rail__related')
    expect(rail).not.toContain('rail__list')
  })

  // The group is two modules now, and neither may shrink: the unit is a fixed
  // 300x250 and the card's own ladder is what gives. Nothing here is elastic,
  // so nothing should claim to be.
  it('holds both modules at their height and lets the ladder do the giving', () => {
    const sticky = /\.rail__sticky \{([^}]*)\}/.exec(css)
    expect(sticky![1]).toMatch(/display: flex/)
    expect(sticky![1]).toMatch(/flex-direction: column/)
    expect(css).toMatch(/\.rail__sticky > \* \{\s*flex: none;\s*\}/)
  })
})

describe('the signup card', () => {
  const rail = readFileSync(
    resolve(
      import.meta.dirname,
      '../../app/(frontend)/components/article-rail.tsx',
    ),
    'utf8',
  )

  // `aspect-ratio` rather than a height is what makes the ladder one number
  // per rung: the picture goes from a frame to a band to nothing, and each
  // step is a single property. A fixed height would need the width too.
  it('sizes its picture by ratio, so a rung can step it', () => {
    const figure = /\.rail__signup-figure \{([^}]*)\}/.exec(css)
    expect(figure, '.rail__signup-figure is missing').toBeTruthy()
    expect(figure![1]).toMatch(/aspect-ratio: 3 \/ 2/)
    // `next/image` with `fill` needs a positioned ancestor, and without one it
    // escapes the card entirely rather than failing visibly.
    expect(figure![1]).toMatch(/position: relative/)
  })

  it('clips the picture to the card rather than to a box inside it', () => {
    const card = /\.rail__signup \{([^}]*)\}/.exec(css)
    expect(card![1]).toMatch(/overflow: hidden/)
    expect(card![1]).toMatch(/border-radius/)
  })

  // The rail is `display: none` below 1280 and everything in it reaches a
  // phone another way, so this picture must not cost a phone a download.
  // `next/image` lazy-loads unless told otherwise, and an element with no box
  // never intersects the viewport — so the one thing that would break it is
  // `priority`, which is also exactly what the featured image needs. Easy to
  // copy from one to the other.
  it('never marks its picture priority', () => {
    expect(rail).not.toContain('priority')
  })

  // Null is the ordinary state: every database that predates the field has it
  // unset, and a card that rendered an empty figure there would be a 199px
  // grey band above the heading on every post.
  it('renders without a picture when there is none', () => {
    expect(rail).toMatch(/\{newsletterImage && \(/)
  })
})

describe('the ad box when nothing is served', () => {
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`\\n${escaped} \\{([^}]*)\\}`).exec(css)
    expect(match, `${selector} is missing from globals.css`).toBeTruthy()
    return match![1]
  }

  // The defect this block exists for, and it failed silently. Google's snippet
  // puts `display: inline-block` in the `<ins>` element's own `style`
  // attribute, which beats any rule in this stylesheet — so the first version
  // of the fallback "hid" the empty unit, hid nothing, and stacked 250px of
  // promo on top of 250px of empty ad. The group went from 658 to 893 against
  // a cap of 800, which scrolls the newsletter button out of reach.
  it('lays the fallback over the unit rather than swapping it in', () => {
    const fallback = rule(".ad-slot[data-fill='unfilled'] .ad-slot__fallback")
    expect(fallback).toMatch(/position: absolute/)
    expect(fallback).toMatch(/inset: 0/)
    // Which only works if the box it covers is a containing block.
    expect(rule('.ad-slot')).toMatch(/position: relative/)
  })

  // Losing that argument with an inline style is silent, so do not start it.
  //
  // Specifically about `display`, not about touching the element at all: the
  // in-article unit takes a `min-height` from here, which the inline style
  // does not set and so does not fight. It is `display` that Google writes
  // inline and `display` that a rule here would silently lose.
  it('never tries to set display on the unit itself', () => {
    const rules = [...css.matchAll(/([^{}]*\.adsbygoogle[^{}]*)\{([^}]*)\}/g)]
    expect(rules.length, 'no .adsbygoogle rules found at all').toBeGreaterThan(
      0,
    )

    for (const [, selector, body] of rules) {
      expect(body, `${selector.trim()} sets display`).not.toMatch(/display:/)
    }
  })

  // "Advertisement" over our own promo is a claim that is not true, but
  // removing it from the flow would shorten the box by 22px at the moment the
  // fallback appears — a shift under the reader, for a word.
  it('hides the label without taking its space', () => {
    const label = rule(".ad-slot[data-fill='unfilled'] .ad-slot__label")
    expect(label).toMatch(/visibility: hidden/)
    expect(label).not.toMatch(/display: none/)
  })

  // Hidden until the slot is known to be empty. `pending` is the third state
  // and it must look like a filled one, or every page would flash a promo
  // before the ad arrives.
  it('shows nothing until the slot is known to be empty', () => {
    expect(rule('.ad-slot__fallback')).toMatch(/display: none/)
    const unit = readFileSync(
      resolve(
        import.meta.dirname,
        '../../app/(frontend)/components/ad-unit.tsx',
      ),
      'utf8',
    )
    expect(unit).toMatch(/useState<Fill>\('pending'\)/)
  })

  // The complaint that produced this layout: one headline sat in the middle of
  // a 250px box and the rest was paper. The list grows into whatever the label
  // leaves, and each item takes an even share of it, so the group reaches the
  // bottom of the box at one item or at three without any height being written
  // down anywhere.
  it('fills the reserved box rather than centring a short block in it', () => {
    expect(rule('.rail__promo')).toMatch(/height: 100%/)
    expect(rule('.rail__promo-list')).toMatch(/flex: 1/)

    const item = rule('.rail__promo-list > li')
    expect(item).toMatch(/flex: 1/)
    // A three-line headline would otherwise push the group past its box.
    expect(item).toMatch(/min-height: 0/)
  })

  // Three items centre inside their own third, which is what spaces them
  // evenly. One item centring inside the whole box put a 60px hole between the
  // eyebrow and the headline it belonged to.
  it('top-aligns the single pick instead of centring it', () => {
    expect(rule('.rail__promo--featured .rail__promo-list > li')).toMatch(
      /align-items: flex-start/,
    )
  })

  // Bounded for the same reason the old related list's titles were: an item
  // has to have a knowable height, or the box it shares with two others does
  // not.
  it('clamps a promoted headline', () => {
    expect(rule('.rail__promo-item h3')).toMatch(/-webkit-line-clamp: 2/)
    expect(rule('.rail__promo-item h3')).toMatch(/display: -webkit-box/)
  })

  // Shallower than the newsletter card's 3:2 directly beneath it. Two frames
  // of the same shape stacked read as a repeat rather than as a rail.
  it('gives the featured picture a different shape from the card below', () => {
    const promo = rule('.rail__promo-figure')
    expect(promo).toMatch(/aspect-ratio: 2 \/ 1/)
    expect(rule('.rail__signup-figure')).toMatch(/aspect-ratio: 3 \/ 2/)
  })

  // A tag that was merely slow can answer after the timeout has already
  // guessed. If the guess were latched, the promo would sit over a real ad —
  // a wasted impression, and something an ad network would object to.
  it('lets a late answer from Google overrule the guess', () => {
    const unit = readFileSync(
      resolve(
        import.meta.dirname,
        '../../app/(frontend)/components/ad-unit.tsx',
      ),
      'utf8',
    )
    expect(unit).toContain('MutationObserver')
    expect(unit).toContain("attributeFilter: ['data-ad-status']")
    // No latch: nothing may stop the observer from reporting a later fill.
    expect(unit).not.toMatch(/settled\s*=\s*true/)
  })
})

describe('the ladder', () => {
  /** Every `max-height` rung in the stylesheet, tallest first, with its body. */
  const rungs = [
    ...css.matchAll(/@media \(max-height: (\d+)px\) \{([\s\S]*?)\n\}/g),
  ]
    .map((match) => ({ at: Number(match[1]), body: match[2] }))
    .sort((a, b) => b.at - a.at)

  /**
   * How tall the sticky pair is on each rung, in CSS pixels.
   *
   * Measured in Chromium rather than computed, and the only numbers in this
   * file that are: the card's height turns on an inline-block button sitting
   * on a text baseline, which arithmetic gets wrong by 3px and a browser gets
   * right. `pnpm measure:rail` prints these; re-run it after touching anything
   * in the group and bring the output back here, to `app/globals.css`, and to
   * `docs/POST_PAGE_LAYOUT.md`.
   */
  const GROUP = { picture: 658, band: 559, noPicture: 460, noCopy: 408 }

  /**
   * What the viewport loses before the group gets any of it, recomputed from
   * the cap rather than written down: the masthead it sticks below, and the
   * room left under it so the group's bottom is never off the screen.
   */
  const reserved = (() => {
    const cap =
      /max-height: calc\(100dvh - var\(--masthead-h\) - ([\d.]+rem)\)/.exec(css)
    const masthead = /--masthead-h: ([\d.]+rem);/.exec(css)
    expect(
      cap,
      'the sticky cap is no longer a calc on --masthead-h',
    ).toBeTruthy()
    expect(masthead, '--masthead-h is missing from globals.css').toBeTruthy()
    return px(masthead![1]) + px(cap![1])
  })()

  it('has the three rungs the card gives in order', () => {
    expect(rungs.map((rung) => rung.at)).toEqual([760, 662, 563])
  })

  // The picture first, because it is the only thing here worth less at a
  // smaller size rather than worthless; then the words; never the control.
  it('steps the picture down, then away, then drops the copy', () => {
    expect(rungs[0].body).toMatch(
      /\.rail__signup-figure \{\s*aspect-ratio: 3 \/ 1;/,
    )
    expect(rungs[1].body).toMatch(/\.rail__signup-figure \{\s*display: none;/)
    expect(rungs[2].body).toMatch(/\.rail__copy \{\s*display: none;/)

    // The control is what the card is for. No rung may take it.
    for (const rung of rungs) {
      expect(rung.body).not.toMatch(/\.button/)
    }
  })

  // The whole point of the rungs, and the one thing about them that goes wrong
  // silently. A rung has to start high enough that its own group already fits
  // the shortest window it covers — otherwise there is a band of viewport
  // heights where the rung above has stopped applying, the rung below has not
  // started, and the group scrolls its own button out of reach.
  it('starts each rung high enough that its own group fits', () => {
    expect(GROUP.picture).toBeLessThanOrEqual(rungs[0].at + 1 - reserved)
    expect(GROUP.band).toBeLessThanOrEqual(rungs[1].at + 1 - reserved)
    expect(GROUP.noPicture).toBeLessThanOrEqual(rungs[2].at + 1 - reserved)
  })

  // Every boundary landed on exactly zero when first computed — a group of 658
  // against a cap of 658 — and a boundary with no margin is one font-rendering
  // difference away from being wrong on somebody else's machine.
  it('leaves each rung a little room rather than landing on the number', () => {
    expect(rungs[0].at + 1 - reserved - GROUP.picture).toBeGreaterThanOrEqual(2)
    expect(rungs[1].at + 1 - reserved - GROUP.band).toBeGreaterThanOrEqual(2)
    expect(rungs[2].at + 1 - reserved - GROUP.noPicture).toBeGreaterThanOrEqual(
      2,
    )
  })

  // What the ladder buys, stated as the number a reader would notice: the
  // window at which the card's button stops being reachable without scrolling
  // the rail itself.
  it('keeps the whole card on screen down to 508px of viewport', () => {
    expect(GROUP.noCopy + reserved).toBeLessThanOrEqual(508)
  })

  // The rungs exist because 279px of the group is a unit that cannot shrink.
  // A rail without one is 379px and fits any window a desktop browser opens
  // in, so it must shed nothing — otherwise a members-only teaser, which
  // carries no unit at all, loses its picture for no reason.
  //
  // Scoping also settles the cascade. `.rail__signup`'s own declarations come
  // later in the stylesheet, so a bare `.rail__signup` inside the media query
  // lost to them on a specificity tie — which is exactly what happened once,
  // and it took a browser to notice.
  it('applies only where there is a unit making the group too tall', () => {
    for (const rung of rungs) {
      for (const selector of rung.body.matchAll(/\n {2}([^{\n]+)\{/g)) {
        expect(selector[1]).toContain('.rail__sticky--ad')
      }
    }
  })

  // The stylesheet is a cascade: a rung written above a taller one would be
  // overridden by it on every window the taller one also matches.
  it('is written tallest first, so each rung overrides the one above', () => {
    const order = [...css.matchAll(/@media \(max-height: (\d+)px\)/g)].map(
      (match) => Number(match[1]),
    )
    expect(order).toEqual([...order].sort((a, b) => b - a))
  })

  // The stylesheet can only hide the card's line of copy, or know whether
  // there is a unit at all, if the component tells it.
  it('is given the hooks it needs by the component', () => {
    const rail = readFileSync(
      resolve(
        import.meta.dirname,
        '../../app/(frontend)/components/article-rail.tsx',
      ),
      'utf8',
    )
    expect(rail.match(/className="rail__copy"/g)!.length).toBe(1)
    expect(rail).toMatch(/adClient \? ' rail__sticky--ad' : ''/)
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

// How far apart the in-article units are, in pixels rather than in words.
//
// `lib/ads/inline.ts` spaces them by word count, which is the only unit a
// server-side splitter has. What `docs/ADVERTISING.md` §8 actually rules on is
// screens — "two units can share a screen, and only two" — and the exchange
// rate between the two is the type in `.prose`. Shrink the body copy and every
// gap shrinks with it, silently, until a reader has the rail unit and two
// inline units in one window and the page reads as an ad break.
//
// So the gap is recomputed here from the stylesheet. The arithmetic is
// deliberately the optimistic one — the tightest lines, no headings, no
// figures, no paragraph gaps — because that is the densest the body can get,
// and a rule that holds at the densest holds everywhere.
describe('the space between in-article units', () => {
  /**
   * Words a line of the measure holds.
   *
   * `POST_PAGE_LAYOUT.md` measures 73 characters at the 704px measure, in
   * Chromium against real body copy. At a five-letter mean plus its space that
   * is 12.2 words, and this rounds *up*: a line that holds more words is a
   * shorter gap, so 13 is the assumption that makes every test below stricter
   * than the page it describes.
   */
  const WORDS_PER_LINE = 13

  /** The tallest desktop window the rail is designed against. */
  const SCREEN = 900

  /** The height of one line box of body copy, from the stylesheet. */
  function lineBox(): number {
    const rule = /\.prose \{([^}]*)\}/.exec(css)
    expect(rule, '.prose is missing from globals.css').toBeTruthy()

    const size = /font-size: ([\d.]+)rem/.exec(rule![1])
    const leading = /line-height: ([\d.]+)/.exec(rule![1])
    expect(size, '.prose sets no font-size').toBeTruthy()
    expect(leading, '.prose sets no line-height').toBeTruthy()

    return Number(size![1]) * REM * Number(leading![1])
  }

  /** The least height a run of body copy can occupy. */
  function atLeastTall(words: number): number {
    return (words / WORDS_PER_LINE) * lineBox()
  }

  it('keeps a whole screen between the opening and the first unit', () => {
    // The first unit is the one that could land beside the rail unit while the
    // hero is still on screen, which would be three impressions in the window
    // a reader forms their first impression of the page in.
    expect(atLeastTall(INLINE_FIRST_WORDS)).toBeGreaterThan(SCREEN)
  })

  it('never lets two inline units share a screen', () => {
    // Two screens rather than one: the rail unit is sticky and is therefore
    // the second unit on every screen of the article by design, so an inline
    // unit arriving while another is still in view is the third.
    expect(atLeastTall(INLINE_GAP_WORDS)).toBeGreaterThan(SCREEN * 2)
  })

  it('caps a long article below one unit per two screens', () => {
    // The whole run, against the longest article in the archive at the time
    // the cap was chosen (7,899 words). This is the density a reader who
    // finishes that piece actually meets, and it is the number to look at
    // before raising INLINE_MAX.
    const longest = 7899
    const screens = atLeastTall(longest) / SCREEN
    expect(screens / INLINE_MAX).toBeGreaterThan(2)
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
