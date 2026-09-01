// The post template's track widths, checked against the stylesheet that makes
// them true.
//
// Every number in `docs/POST_PAGE_LAYOUT.md` — the 672px measure, the notes
// margin at each breakpoint, the distance a figure may bleed — is arithmetic on
// four custom properties in `app/globals.css`. That arithmetic is easy to break
// by nudging one of them: widening the block by a rem silently widens every
// figure, and narrowing the breakpoint's block below its own breakpoint takes
// the left gutter away, which is the difference between a page that reads as
// composed and one that reads as cramped.
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
const PADDING = 1.5 * REM * 2

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

function px(value: string): number {
  const rem = /^([\d.]+)rem$/.exec(value)
  if (rem) return Number(rem[1]) * REM
  const pixels = /^([\d.]+)px$/.exec(value)
  if (pixels) return Number(pixels[1])
  throw new Error(`not a fixed length: ${value}`)
}

/** What the shell resolves to at a viewport wide enough to carry the rail. */
function tracks(viewport: number) {
  const shell = shellAt(viewport)
  const block = Math.min(px(shell['--shell']), viewport)
  const text = px(shell['--text-w'])
  const rail = px(shell['--rail-w'])
  const gap = px(shell['--gap'])
  const notesGap = px(shell['--notes-gap'])

  // `--bleed` in the stylesheet, evaluated: what a figure may take beyond the
  // text column once the rail and the gap in front of it are paid for.
  const bleed = block - PADDING - rail - gap - text

  return {
    block,
    text,
    rail,
    bleed,
    notes: bleed - notesGap,
    figure: text + bleed,
    gutter: (viewport - block) / 2 + PADDING / 2,
  }
}

describe('the article shell', () => {
  it('holds the reading measure at 672px, whatever the screen', () => {
    for (const viewport of [1280, 1440, 1600, 1920, 2560]) {
      expect(tracks(viewport).text).toBe(672)
    }
  })

  // Measured in Chromium at 17.6px Inter: 672px sets ~73 characters and 656px
  // — what the column was — sets ~67. Both sit inside the comfortable 45–75,
  // which is why the column did not get wider when the page did.
  it('keeps the measure inside the range a wider page would have left', () => {
    const text = tracks(1440).text
    expect(text).toBeGreaterThanOrEqual(640)
    expect(text).toBeLessThanOrEqual(704)
  })

  it('resolves the tracks the layout document states', () => {
    expect(tracks(1280)).toMatchObject({ notes: 124, figure: 828, rail: 300 })
    expect(tracks(1440)).toMatchObject({ notes: 276, figure: 980, rail: 300 })
    expect(tracks(1600)).toMatchObject({ notes: 436, figure: 1140, rail: 300 })
  })

  it('stops growing past 1600, so a figure has a ceiling', () => {
    expect(tracks(2560).figure).toBe(tracks(1600).figure)
  })

  // The block is centred, so the gutter is what is left over. If a breakpoint's
  // block were as wide as the breakpoint itself, the text would start 24px from
  // the edge of the screen at that width.
  it('leaves a real gutter at the width each breakpoint starts at', () => {
    for (const viewport of [1280, 1440, 1600]) {
      expect(tracks(viewport).gutter).toBeGreaterThanOrEqual(56)
    }
  })

  it('never asks for more width than the block has', () => {
    for (const viewport of [1280, 1440, 1600, 1920]) {
      const { block, text, rail, bleed } = tracks(viewport)
      expect(bleed).toBeGreaterThanOrEqual(0)
      expect(text + bleed + rail + PADDING).toBeLessThanOrEqual(block)
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

  it('clears the masthead when it sticks', () => {
    expect(css).toMatch(
      /\.rail__sticky \{[\s\S]*?top: calc\(var\(--masthead-h\)/,
    )
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
