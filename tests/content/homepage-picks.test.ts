// What "Editors' picks" is allowed to show.
//
// The section claimed to be edited while being reverse-chronological, and the
// `featured` flag it should have been reading was consumed by nothing. These
// pin the tier order, the cap on the flag tier, and the two behaviours the old
// slice got wrong: a piece shown twice, and a flagged piece pushed down the
// list by the recency tier it should have jumped.

import { describe, expect, it } from 'vitest'

import {
  FEATURED_SLOTS,
  OPENING_SLOTS,
  PICK_SLOTS,
  RECENT_QUERY_SIZE,
  RUNNER_SLOTS,
} from '../../lib/content/homepage'
import { selectPicks } from '../../lib/content/homepage'
import type { PostCard } from '../../lib/content/queries'

function post(id: string, featured = false): PostCard {
  return {
    id,
    slug: `post-${id}`,
    title: `Post ${id}`,
    excerpt: '',
    publishedAt: null,
    featured,
    authors: [],
    tags: [],
    image: null,
    readingTime: 5,
    visibility: 'public',
  }
}

const ids = (posts: PostCard[]) => posts.map((p) => p.id)

/** n posts, newest first, as a recency query returns them. */
function series(n: number, prefix = 'r'): PostCard[] {
  return Array.from({ length: n }, (_, i) => post(`${prefix}${i + 1}`))
}

describe('selectPicks', () => {
  it('falls back to recency when nothing is curated or flagged', () => {
    expect(ids(selectPicks({ recent: series(7) }))).toEqual([
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      'r6',
    ])
  })

  it('never repeats the piece the Latest band already holds', () => {
    const recent = series(7)
    const picks = selectPicks({ recent, exclude: [recent[0]!.id] })
    expect(ids(picks)).not.toContain('r1')
    expect(picks).toHaveLength(PICK_SLOTS)
  })

  it('shows a lone published post once, not twice', () => {
    // The old slice fell back to the whole list when there was nothing after
    // the newest post, so a site with one post rendered it in the band and
    // again below it.
    const only = post('solo')
    expect(selectPicks({ recent: [only], exclude: [only.id] })).toEqual([])
  })

  it('lifts a flagged piece above the recency tail', () => {
    const flagged = post('f1', true)
    const picks = selectPicks({ featured: [flagged], recent: series(7) })
    expect(ids(picks)[0]).toBe('f1')
  })

  it('caps the flag tier so the page keeps recent work', () => {
    // Every flagged post in the live archive is from late 2025. Without the cap
    // the homepage would show nothing newer except the Latest band.
    const flagged = Array.from({ length: 9 }, (_, i) => post(`f${i + 1}`, true))
    const picks = selectPicks({ featured: flagged, recent: series(7) })

    expect(picks).toHaveLength(PICK_SLOTS)
    expect(ids(picks).filter((id) => id.startsWith('f'))).toHaveLength(
      FEATURED_SLOTS,
    )
    expect(ids(picks).filter((id) => id.startsWith('r'))).toHaveLength(
      PICK_SLOTS - FEATURED_SLOTS,
    )
  })

  it('lets an explicit list take every slot', () => {
    // An editor who names six pieces means six; the cap binds the flag only.
    const curated = series(PICK_SLOTS, 'c')
    const picks = selectPicks({
      curated,
      featured: series(3, 'f'),
      recent: series(7),
    })
    expect(ids(picks)).toEqual(ids(curated))
  })

  it('keeps a piece once, at its earliest tier', () => {
    const shared = post('both', true)
    const picks = selectPicks({
      featured: [shared],
      recent: [post('r1'), shared, post('r2')],
    })
    expect(ids(picks)).toEqual(['both', 'r1', 'r2'])
  })

  it('asks for enough recent posts to fill the section alone', () => {
    // When every flagged post is also a recent post the flag tier adds no
    // candidates, so recency has to cover the band plus every slot.
    const recent = series(RECENT_QUERY_SIZE)
    const flagged = recent.slice(1, 1 + FEATURED_SLOTS)
    const picks = selectPicks({
      featured: flagged,
      recent,
      exclude: [recent[0]!.id],
    })
    expect(picks).toHaveLength(PICK_SLOTS)
  })
})

describe('the opening and the picks together', () => {
  it('asks for enough recent posts to fill both, with nothing curated', () => {
    // The worst case is the ordinary one on a site nobody has curated: the
    // opening takes the six newest, and recency has to cover every pick slot
    // below it too.
    const recent = series(RECENT_QUERY_SIZE)
    const opening = recent.slice(0, OPENING_SLOTS)
    const picks = selectPicks({
      recent,
      exclude: opening.map((post) => post.id),
    })

    expect(opening).toHaveLength(OPENING_SLOTS)
    expect(picks).toHaveLength(PICK_SLOTS)
  })

  it('never shows a piece in both the opening and the picks', () => {
    const recent = series(RECENT_QUERY_SIZE)
    const opening = recent.slice(0, OPENING_SLOTS)
    // A flagged post that is also one of the newest is the case that used to
    // produce a duplicate: the opening holds it, and the flag tier would
    // happily offer it again.
    const picks = selectPicks({
      curated: [recent[0]!],
      featured: [recent[1]!, post('f1', true)],
      recent,
      exclude: opening.map((post) => post.id),
    })

    const openingIds = new Set(ids(opening))
    for (const id of ids(picks)) expect(openingIds.has(id)).toBe(false)
  })

  it('leaves the lead with one runner fewer when the archive is short', () => {
    // Seven published posts: the opening takes six, one is left for the picks.
    const recent = series(7)
    const opening = recent.slice(0, OPENING_SLOTS)
    const picks = selectPicks({
      recent,
      exclude: opening.map((post) => post.id),
    })

    expect(opening.slice(1)).toHaveLength(RUNNER_SLOTS)
    expect(picks).toHaveLength(1)
  })

  it('gives a one-post site a lead and nothing else', () => {
    const only = [post('solo')]
    const opening = only.slice(0, OPENING_SLOTS)
    expect(opening).toHaveLength(1)
    expect(selectPicks({ recent: only, exclude: ids(opening) })).toEqual([])
  })
})
