import { describe, expect, it } from 'vitest'

import {
  countWords,
  INLINE_FIRST_WORDS,
  INLINE_GAP_WORDS,
  INLINE_MAX,
  planInlineBreaks,
  splitHtmlForAds,
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

describe('splitHtmlForAds', () => {
  const body = Array.from(
    { length: 60 },
    (_, i) => `<p>${`word${i} `.repeat(100)}</p>`,
  ).join('')

  // The property that matters most: whatever the splitter does, the article
  // has to come out the other side unchanged. A split through the middle of a
  // tag is a broken page, and it is the failure this function is prone to.
  it('is lossless — the chunks rejoined are the original', () => {
    expect(splitHtmlForAds(body).join('')).toBe(body)
  })

  it('returns one chunk, unchanged, when nothing qualifies', () => {
    expect(splitHtmlForAds('<p>short</p>')).toEqual(['<p>short</p>'])
  })

  it('produces one more chunk than it does units', () => {
    const chunks = splitHtmlForAds(body)
    expect(chunks).toHaveLength(INLINE_MAX + 1)
  })

  it('never opens a chunk mid-element', () => {
    for (const chunk of splitHtmlForAds(body)) {
      expect(chunk.startsWith('<p>')).toBe(true)
      expect(chunk.endsWith('</p>')).toBe(true)
    }
  })
})

describe('countWords', () => {
  it('counts words rather than tags or punctuation', () => {
    expect(countWords('<p>one two <em>three</em>.</p>')).toBe(3)
    expect(countWords('<img src="a.jpg" alt="">')).toBe(0)
  })
})
