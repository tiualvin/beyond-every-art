import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { INLINE_MAX } from '../../lib/ads/inline'
import {
  INLINE_PROMO_MAX,
  READ_NEXT_COUNT,
  RELATED_QUERY_LIMIT,
  splitRelated,
} from '../../lib/content/related'

const page = readFileSync(
  join(process.cwd(), 'app/(frontend)/[slug]/page.tsx'),
  'utf8',
)
const rail = readFileSync(
  join(process.cwd(), 'app/(frontend)/components/article-rail.tsx'),
  'utf8',
)

describe('related posts on a post page', () => {
  it('shows three, which is what "Read next" holds', () => {
    expect(READ_NEXT_COUNT).toBe(3)
  })

  // The same fact written once. Every in-body unit an article can carry is a
  // unit that needs something to show when Google declines it, so a raised
  // `INLINE_MAX` must raise the supply with it — otherwise the last slots on
  // the longest articles get a labelled empty box, silently.
  it('supplies one piece per in-body unit the body can carry', () => {
    expect(INLINE_PROMO_MAX).toBe(INLINE_MAX)
  })

  // The page asked for six while the rail took a second helping of the same
  // query for its own list. That module is gone, and a limit left at six would
  // be three rows read on every post render that nothing renders — the kind of
  // cost that survives a deletion because nothing fails when it does.
  it('asks the database for exactly what it renders', () => {
    expect(RELATED_QUERY_LIMIT).toBe(READ_NEXT_COUNT + INLINE_PROMO_MAX)
    expect(page).toContain('READ_NEXT_COUNT,')
  })

  // The two surfaces are disjoint because one takes the head and the other the
  // tail, not because anything compares them. A reader meeting the same piece
  // in a house slot and again in "Read next" is the defect this shape rules
  // out rather than checks for.
  it('divides the pool without overlapping or reordering it', () => {
    const pool = Array.from({ length: RELATED_QUERY_LIMIT }, (_, i) => i)
    const { readNext, inline } = splitRelated(pool)

    expect(readNext).toEqual([0, 1, 2])
    expect(inline).toEqual([3, 4, 5, 6, 7, 8])
    expect(readNext.concat(inline)).toEqual(pool)
    expect(inline.filter((item) => readNext.includes(item))).toEqual([])
  })

  // A thin archive is the ordinary state of a new site and of the development
  // seed. "Read next" is filled first because it is the surface a reader is
  // certain to reach; the slots take what is left, which may be nothing.
  it('fills "Read next" first when the archive is too thin for both', () => {
    expect(splitRelated([1, 2])).toEqual({ readNext: [1, 2], inline: [] })
    expect(splitRelated([1, 2, 3, 4])).toEqual({
      readNext: [1, 2, 3],
      inline: [4],
    })
    expect(splitRelated([])).toEqual({ readNext: [], inline: [] })
  })

  // More than was asked for is dropped rather than shown. The limit is the
  // query's, so this only happens if a caller passes its own list, and a
  // seventh house slot is a slot `lib/ads/inline.ts` says cannot exist.
  it('never hands out more than the units can hold', () => {
    const pool = Array.from({ length: RELATED_QUERY_LIMIT + 4 }, (_, i) => i)
    expect(splitRelated(pool).inline).toHaveLength(INLINE_PROMO_MAX)
  })

  // The rail's copy of this list is gone. Everything it showed still closes
  // the article in "Read next", on every device rather than desktop only, so
  // a reader lost nothing — but a rail that quietly took posts again would put
  // the sticky group back over the height it is budgeted for.
  it('does not feed the rail a second copy of the list', () => {
    // The markup, not the prose: the component's doc comment explains why the
    // module went, so matching on its name would fail on the explanation.
    expect(rail).not.toContain('rail__related')
    expect(rail).not.toContain('rail__list')
    expect(rail).not.toContain('PostCard')
    expect(rail).not.toMatch(/related[?]?:/)
  })
})
