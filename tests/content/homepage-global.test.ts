// What the Homepage global promises the page, and what it refuses to promise.
//
// Every field on it is optional, and the homepage has to be unchanged when they
// are all empty — that is what makes shipping the global a safe deploy rather
// than a redesign that happens the moment it merges. These pin the two halves
// that are easy to get wrong: the empty case, and the pairing's all-or-nothing
// rule.
//
// `readHomepage` itself talks to Payload, so what is exercised here is the
// shape it produces and the way the page consumes it.

import { describe, expect, it } from 'vitest'

import { selectPicks } from '../../lib/content/homepage'
import type { HomepageContent, PostCard } from '../../lib/content/queries'

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

/** What the reader returns for a global nobody has filled in. */
const EMPTY: HomepageContent = {
  picks: [],
  pairing: null,
  cover: { kicker: null, headline: null },
}

describe('an unfilled Homepage global', () => {
  it('leaves the picks exactly as they were', () => {
    // The deploy-day case: the section still falls through the flag to
    // recency, which is what it did before the global existed.
    const flagged = [post('f1', true)]
    const recent = [post('r1'), post('r2'), post('r3')]

    const before = selectPicks({ featured: flagged, recent })
    const after = selectPicks({
      curated: EMPTY.picks,
      featured: flagged,
      recent,
    })

    expect(ids(after)).toEqual(ids(before))
  })

  it('offers no cover wording, so the page keeps its own', () => {
    expect(EMPTY.cover.kicker).toBeNull()
    expect(EMPTY.cover.headline).toBeNull()
  })

  it('offers no pairing, so that section does not render', () => {
    expect(EMPTY.pairing).toBeNull()
  })
})

describe('a filled Homepage global', () => {
  it('lets the named list outrank the flag and recency', () => {
    const curated = [post('c1'), post('c2')]
    const picks = selectPicks({
      curated,
      featured: [post('f1', true)],
      recent: [post('r1'), post('r2')],
    })
    expect(ids(picks).slice(0, 2)).toEqual(['c1', 'c2'])
  })

  it('still drops a piece the reader is already being shown', () => {
    // An editor naming the newest article does not get it twice; the module
    // holding it above wins, and the pick falls through to the next one.
    const lead = post('lead')
    const picks = selectPicks({
      curated: [lead, post('c2')],
      recent: [post('r1')],
      exclude: [lead.id],
    })
    expect(ids(picks)).not.toContain('lead')
    expect(ids(picks)[0]).toBe('c2')
  })
})
