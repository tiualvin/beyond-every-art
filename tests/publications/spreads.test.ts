import { describe, expect, it } from 'vitest'

import {
  buildSpreads,
  spreadAt,
  spreadCount,
  spreadForPage,
  spreadIndexOf,
  type SpreadOptions,
} from '../../lib/publications/spreads'

const options = (overrides: Partial<SpreadOptions> = {}): SpreadOptions => ({
  pageCount: 96,
  firstPageIsCover: true,
  readingDirection: 'ltr',
  layout: 'spread',
  ...overrides,
})

const pagesOf = (spreadOptions: SpreadOptions) =>
  buildSpreads(spreadOptions).map((spread) => spread.pages)

const slotsOf = (spreadOptions: SpreadOptions) =>
  buildSpreads(spreadOptions).map((spread) => spread.slots)

describe('buildSpreads with a cover', () => {
  it('stands the cover alone and pairs from page 2', () => {
    // The brief's own example: 1 alone, then 2–3, 4–5.
    expect(pagesOf(options({ pageCount: 5 }))).toEqual([[1], [2, 3], [4, 5]])
  })

  it('puts the cover on the right and a lone back cover on the left', () => {
    // A front cover is a right-hand page. If it sat on the left, every facing
    // pair after it would be one page out of step.
    expect(slotsOf(options({ pageCount: 4 }))).toEqual([
      [null, 1],
      [2, 3],
      [4, null],
    ])
  })

  it('keeps every page exactly once, in order', () => {
    for (const pageCount of [1, 2, 3, 4, 95, 96, 97]) {
      const flat = pagesOf(options({ pageCount })).flat()
      expect(flat).toEqual(Array.from({ length: pageCount }, (_, i) => i + 1))
    }
  })

  it('handles a one-page publication', () => {
    expect(slotsOf(options({ pageCount: 1 }))).toEqual([[null, 1]])
  })
})

describe('buildSpreads without a cover', () => {
  it('pairs from page 1', () => {
    expect(pagesOf(options({ pageCount: 4, firstPageIsCover: false }))).toEqual(
      [
        [1, 2],
        [3, 4],
      ],
    )
  })

  it('leaves a lone last page on the left', () => {
    expect(slotsOf(options({ pageCount: 3, firstPageIsCover: false }))).toEqual(
      [
        [1, 2],
        [3, null],
      ],
    )
  })
})

describe('buildSpreads right to left', () => {
  it('mirrors every spread, cover included', () => {
    expect(slotsOf(options({ pageCount: 4, readingDirection: 'rtl' }))).toEqual(
      [
        [1, null],
        [3, 2],
        [null, 4],
      ],
    )
  })

  it('keeps reading order separate from screen order', () => {
    const [, spread] = buildSpreads(
      options({ pageCount: 4, readingDirection: 'rtl' }),
    )
    expect(spread!.pages).toEqual([2, 3])
    expect(spread!.slots).toEqual([3, 2])
  })
})

describe('buildSpreads in the single layout', () => {
  it('shows one page at a time, whatever the cover and direction', () => {
    for (const firstPageIsCover of [true, false]) {
      for (const readingDirection of ['ltr', 'rtl'] as const) {
        expect(
          slotsOf(
            options({
              pageCount: 3,
              layout: 'single',
              firstPageIsCover,
              readingDirection,
            }),
          ),
        ).toEqual([[1], [2], [3]])
      }
    }
  })
})

describe('spreadCount', () => {
  it('counts the cover, the pairs and any lone back cover', () => {
    expect(spreadCount(options({ pageCount: 96 }))).toBe(49)
    expect(spreadCount(options({ pageCount: 97 }))).toBe(49)
    expect(
      spreadCount(options({ pageCount: 96, firstPageIsCover: false })),
    ).toBe(48)
    expect(
      spreadCount(options({ pageCount: 97, firstPageIsCover: false })),
    ).toBe(49)
    expect(spreadCount(options({ pageCount: 96, layout: 'single' }))).toBe(96)
  })

  it('treats an unusable page count as an empty publication', () => {
    for (const pageCount of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(spreadCount(options({ pageCount }))).toBe(0)
      expect(buildSpreads(options({ pageCount }))).toEqual([])
    }
  })

  it('rounds a fractional page count down', () => {
    expect(pagesOf(options({ pageCount: 3.7 }))).toEqual([[1], [2, 3]])
  })
})

describe('spreadIndexOf and spreadForPage', () => {
  it('finds the spread a page is on', () => {
    expect(spreadIndexOf(1, options())).toBe(0)
    expect(spreadIndexOf(2, options())).toBe(1)
    expect(spreadIndexOf(3, options())).toBe(1)
    expect(spreadIndexOf(18, options())).toBe(9)
    expect(spreadIndexOf(3, options({ firstPageIsCover: false }))).toBe(1)
    expect(spreadIndexOf(18, options({ layout: 'single' }))).toBe(17)
  })

  it('agrees with buildSpreads for every page', () => {
    for (const firstPageIsCover of [true, false]) {
      for (const layout of ['spread', 'single'] as const) {
        for (const pageCount of [1, 2, 7, 8]) {
          const spreadOptions = options({ pageCount, firstPageIsCover, layout })
          for (let page = 1; page <= pageCount; page += 1) {
            expect(spreadForPage(page, spreadOptions)!.pages).toContain(page)
          }
        }
      }
    }
  })

  it('lands an out-of-range page on the nearest spread', () => {
    expect(spreadForPage(0, options({ pageCount: 5 }))!.pages).toEqual([1])
    expect(spreadForPage(-3, options({ pageCount: 5 }))!.pages).toEqual([1])
    expect(spreadForPage(120, options({ pageCount: 5 }))!.pages).toEqual([4, 5])
    expect(spreadForPage(Number.NaN, options({ pageCount: 5 }))!.pages).toEqual(
      [1],
    )
  })

  it('has no spread to find in an empty publication', () => {
    expect(spreadForPage(1, options({ pageCount: 0 }))).toBeNull()
  })

  it('keeps the page when switching between layouts', () => {
    // The reader switches a phone-width window to single pages and back; the
    // page a reader was on is the thing that has to survive the switch.
    const spread = spreadForPage(18, options())!
    const single = spreadForPage(
      spread.pages[0]!,
      options({ layout: 'single' }),
    )
    expect(single!.pages).toEqual([18])
    expect(spreadForPage(single!.pages[0]!, options())!.pages).toEqual([18, 19])
  })
})

describe('spreadAt', () => {
  it('refuses an index outside the publication', () => {
    expect(spreadAt(-1, options({ pageCount: 5 }))).toBeNull()
    expect(spreadAt(3, options({ pageCount: 5 }))).toBeNull()
    expect(spreadAt(1.5, options({ pageCount: 5 }))).toBeNull()
  })
})
