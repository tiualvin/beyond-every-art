import { describe, expect, it } from 'vitest'

import {
  countWords,
  INLINE_FIRST_WORDS,
  INLINE_GAP_WORDS,
  INLINE_MAX,
  INLINE_MOBILE_GAP_WORDS,
  INLINE_MOBILE_MAX,
  INLINE_MOBILE_MIN_WORDS,
  planInlineBreaks,
  planInlineSlots,
  splitHtmlForAds,
  splitLexicalForAds,
  topLevelBlocks,
  type InlineBlock,
} from '@/lib/ads/inline'

/** `n` text blocks of `words` each. */
const text = (n: number, words: number): InlineBlock[] =>
  Array.from({ length: n }, () => ({ words, kind: 'text' as const }))

describe('planInlineBreaks', () => {
  it('places nothing in an article too short to reach the first threshold', () => {
    expect(planInlineBreaks(text(3, 100))).toEqual([])
  })

  it('places the first unit once the opening words have been read', () => {
    // 100 words a block: the fifth block crosses 400.
    const breaks = planInlineBreaks(text(20, 100))
    expect(breaks[0]).toBe(INLINE_FIRST_WORDS / 100 - 1)
  })

  it('spaces the rest a gap apart', () => {
    const breaks = planInlineBreaks(text(60, 100))
    const gaps = breaks.slice(1).map((at, i) => (at - breaks[i]) * 100)

    for (const gap of gaps) expect(gap).toBe(INLINE_GAP_WORDS)
  })

  // The cap is the part that binds on this archive: most articles are long
  // enough to reach it, so it rather than the gap decides the count.
  it('never exceeds the cap, however long the article', () => {
    expect(planInlineBreaks(text(400, 100))).toHaveLength(INLINE_MAX)
  })

  // A heading belongs to the paragraph beneath it, and a unit between them
  // orphans the heading at the bottom of a screen.
  //
  // The words are chosen so the threshold is crossed *on* the heading. An
  // earlier version of this test put 400 words in four blocks, which crossed
  // it one block early — so the heading was never a candidate and the test
  // passed without exercising the rule at all.
  it('never breaks straight after a heading', () => {
    const blocks: InlineBlock[] = [
      ...text(3, 130),
      { words: 30, kind: 'heading' },
      ...text(10, 100),
    ]

    expect(planInlineBreaks(blocks)).not.toContain(3)
    expect(planInlineBreaks(blocks)[0]).toBe(4)
  })

  // The text under a figure often reads as its caption whether or not it is
  // marked up as one, which is ordinary in migrated Ghost bodies.
  it('never breaks straight after a figure', () => {
    const blocks: InlineBlock[] = [
      ...text(3, 130),
      { words: 30, kind: 'figure' },
      ...text(10, 100),
    ]

    expect(planInlineBreaks(blocks)).not.toContain(3)
    expect(planInlineBreaks(blocks)[0]).toBe(4)
  })

  // Deferring rather than dropping is what keeps the count right on the
  // figure-heavy articles, which is where this archive is densest.
  it('defers past a run of figures to the next legal boundary', () => {
    const blocks: InlineBlock[] = [
      ...text(3, 130),
      { words: 10, kind: 'figure' },
      { words: 10, kind: 'figure' },
      { words: 10, kind: 'heading' },
      ...text(10, 100),
    ]

    expect(planInlineBreaks(blocks)[0]).toBe(6)
  })

  // Measured from the words actually read, not from the threshold: otherwise a
  // unit deferred past a run of figures bunches against the next one.
  it('measures the next gap from where the unit landed', () => {
    const blocks: InlineBlock[] = [
      ...text(3, 130),
      ...Array.from({ length: 5 }, () => ({
        words: 60,
        kind: 'figure' as const,
      })),
      ...text(30, 100),
    ]
    const [first, second] = planInlineBreaks(blocks)
    // Words between the two breaks, counted off the same blocks the planner saw.
    const between = blocks
      .slice(first + 1, second + 1)
      .reduce((total, block) => total + block.words, 0)

    expect(between).toBeGreaterThanOrEqual(INLINE_GAP_WORDS)
  })

  // A unit at the very end of the body is `article-end` with extra steps, and
  // that placement already exists.
  it('never breaks after the last block', () => {
    const breaks = planInlineBreaks(text(5, 500))
    expect(breaks).not.toContain(4)
  })
})

describe('topLevelBlocks', () => {
  it('finds each top-level element once', () => {
    const blocks = topLevelBlocks('<p>one</p><h2>two</h2><p>three</p>')

    expect(blocks.map((b) => b.kind)).toEqual(['text', 'heading', 'text'])
    expect(blocks.map((b) => b.html).join('')).toBe(
      '<p>one</p><h2>two</h2><p>three</p>',
    )
  })

  it('keeps a nested element inside its parent', () => {
    const blocks = topLevelBlocks(
      '<figure><img src="a.jpg"><figcaption>a</figcaption></figure><p>after</p>',
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0].kind).toBe('figure')
  })

  it('does not look for a closing tag a void element never has', () => {
    const blocks = topLevelBlocks('<img src="a.jpg"><p>after</p>')

    expect(blocks).toHaveLength(2)
    expect(blocks[0].kind).toBe('figure')
    expect(blocks[1].html).toBe('<p>after</p>')
  })

  it('counts nesting of the same tag rather than closing at the first match', () => {
    const blocks = topLevelBlocks(
      '<div><div>inner</div>outer</div><p>after</p>',
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0].html).toBe('<div><div>inner</div>outer</div>')
  })

  it('carries loose text into the element that follows it', () => {
    const blocks = topLevelBlocks('stray <p>one</p>')

    expect(blocks).toHaveLength(1)
    expect(blocks[0].html).toBe('stray <p>one</p>')
  })

  it('skips comments', () => {
    const blocks = topLevelBlocks('<!-- kg-card --><p>one</p>')

    expect(blocks.map((b) => b.html)).toEqual(['<p>one</p>'])
  })
})

describe('planInlineSlots', () => {
  /** Running word count at the end of each block. */
  const through = (blocks: InlineBlock[]) => {
    let total = 0
    return blocks.map((block) => (total += block.words))
  }

  // The promise that makes the phone tier safe to ship: nothing a desktop or
  // tablet renders moves. Their slots are the old plan, verbatim.
  it('keeps the desktop plan exactly as it was', () => {
    for (const blocks of [text(20, 100), text(60, 100), text(400, 100)]) {
      const all = planInlineSlots(blocks)
        .filter((slot) => slot.tier === 'all')
        .map((slot) => slot.at)
      expect(all).toEqual(planInlineBreaks(blocks))
    }
  })

  it('puts a phone-only unit halfway between each pair of desktop ones', () => {
    const slots = planInlineSlots(text(60, 100))
    const words = through(text(60, 100))
    const at = slots.map((slot) => words[slot.at]!)
    expect(at[0]).toBe(INLINE_FIRST_WORDS)
    for (let i = 1; i < at.length; i++) {
      expect(at[i]! - at[i - 1]!).toBe(INLINE_MOBILE_GAP_WORDS)
    }
    expect(slots.map((slot) => slot.tier)).toEqual([
      'all',
      'mobile',
      'all',
      'mobile',
      'all',
      'mobile',
      'all',
      'mobile',
      'all',
      'mobile',
      'all',
      'mobile',
    ])
  })

  it('never lets two units on a phone come closer than the phone minimum', () => {
    const blocks: InlineBlock[] = Array.from({ length: 120 }, (_, i) => ({
      words: 40 + ((i * 37) % 90),
      kind: i % 7 === 3 ? 'figure' : i % 11 === 5 ? 'heading' : 'text',
    }))
    const words = through(blocks)
    const at = planInlineSlots(blocks).map((slot) => words[slot.at]!)

    for (let i = 1; i < at.length; i++) {
      expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(
        INLINE_MOBILE_MIN_WORDS,
      )
    }
  })

  it('never exceeds the phone cap, however long the article', () => {
    expect(planInlineSlots(text(400, 100))).toHaveLength(INLINE_MOBILE_MAX)
  })

  it('gives a phone-only unit the same never-split rules', () => {
    // Desktop units at blocks 3 and 11; the phone unit is due at block 7,
    // which is a heading, so it waits for block 8 — 300 words before the next
    // desktop unit, which is still enough room.
    const blocks = text(20, 100)
    blocks[7] = { words: 100, kind: 'heading' }
    const mobile = planInlineSlots(blocks).filter(
      (slot) => slot.tier === 'mobile',
    )
    expect(mobile[0]!.at).toBe(8)
  })

  it('skips a phone unit rather than crowd the desktop unit after it', () => {
    // Figures from 7 to 9 push the phone unit to block 10, one block before
    // the desktop unit at 11 — 100 words, under the minimum. It is dropped.
    const blocks = text(20, 100)
    for (const i of [7, 8, 9]) blocks[i] = { words: 100, kind: 'figure' }
    const slots = planInlineSlots(blocks)
    expect(slots.slice(0, 2).map((slot) => slot.tier)).toEqual(['all', 'all'])
  })

  it('never puts a phone unit after the last block', () => {
    const blocks = text(10, 100)
    const slots = planInlineSlots(blocks)
    expect(slots.every((slot) => slot.at < blocks.length - 1)).toBe(true)
  })

  // Desktop slots take the promos they always took, so the desktop page is
  // unchanged here too; phone-only slots take what follows. Every slot a
  // reader can see holds a different piece, on either device.
  it('gives desktop slots the head of the promo list and phones the rest', () => {
    const slots = planInlineSlots(text(60, 100))
    const desktop = slots.filter((slot) => slot.tier === 'all')
    const mobile = slots.filter((slot) => slot.tier === 'mobile')

    expect(desktop.map((slot) => slot.promo)).toEqual([0, 1, 2, 3, 4, 5])
    expect(mobile.map((slot) => slot.promo)).toEqual([6, 7, 8, 9, 10, 11])
  })
})

describe('splitHtmlForAds', () => {
  const body = Array.from(
    { length: 60 },
    (_, i) => `<p>${`word${i} `.repeat(100)}</p>`,
  ).join('')

  // The property that matters most: whatever the splitter does, the article
  // has to come out the other side unchanged. A split through the middle of a
  // tag is a broken page, and it is the failure this function is prone to.
  it('is lossless — the chunks rejoined are the original', () => {
    expect(splitHtmlForAds(body).parts.join('')).toBe(body)
  })

  it('returns one chunk, unchanged, when nothing qualifies', () => {
    expect(splitHtmlForAds('<p>short</p>')).toEqual({
      parts: ['<p>short</p>'],
      slots: [],
    })
  })

  it('produces one more chunk than it does units', () => {
    const { parts, slots } = splitHtmlForAds(body)
    expect(slots).toHaveLength(INLINE_MOBILE_MAX)
    expect(parts).toHaveLength(slots.length + 1)
    expect(slots.filter((slot) => slot.tier === 'all')).toHaveLength(INLINE_MAX)
  })

  it('never opens a chunk mid-element', () => {
    for (const chunk of splitHtmlForAds(body).parts) {
      expect(chunk.startsWith('<p>')).toBe(true)
      expect(chunk.endsWith('</p>')).toBe(true)
    }
  })
})

describe('splitLexicalForAds', () => {
  const paragraph = (i: number) => ({
    type: 'paragraph',
    children: [{ type: 'text', text: `word${i} `.repeat(100) }],
  })
  const body = {
    root: {
      type: 'root',
      children: Array.from({ length: 60 }, (_, i) => paragraph(i)),
    },
  }

  it('cuts the node list at the same slots, losing nothing', () => {
    const { parts, slots } = splitLexicalForAds(body as never)
    expect(parts).toHaveLength(slots.length + 1)
    expect(parts.flatMap((part) => part.root.children)).toEqual(
      body.root.children,
    )
    expect(parts.every((part) => (part.root.children ?? []).length > 0)).toBe(
      true,
    )
  })
})

describe('countWords', () => {
  it('counts words rather than tags or punctuation', () => {
    expect(countWords('<p>one two <em>three</em>.</p>')).toBe(3)
    expect(countWords('<img src="a.jpg" alt="">')).toBe(0)
  })
})
