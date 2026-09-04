import { describe, expect, it } from 'vitest'

import type { PostCard } from '../../lib/content/queries'
import {
  RAIL_COUNT,
  READ_NEXT_COUNT,
  RELATED_QUERY_LIMIT,
  splitRelated,
} from '../../lib/content/related'

const post = (slug: string): PostCard => ({
  id: slug,
  slug,
  title: slug,
  excerpt: '',
  publishedAt: null,
  featured: false,
  authors: [],
  tags: [],
  image: null,
  readingTime: 4,
  visibility: 'public',
})

const slugs = (posts: PostCard[]) => posts.map((entry) => entry.slug)

describe('splitRelated', () => {
  it('fills both surfaces when there are enough posts', () => {
    const { readNext, rail } = splitRelated(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(post),
    )

    expect(slugs(readNext)).toEqual(['a', 'b', 'c'])
    expect(slugs(rail)).toEqual(['d', 'e', 'f'])
  })

  // The query returns tag matches before its recency top-up, so the front of
  // the list is the most relevant. "Read next" shows on every device and the
  // rail is hidden below 1280, so the front of the list goes to "Read next".
  it('spends the closest matches where every reader sees them', () => {
    const { readNext, rail } = splitRelated(['a', 'b', 'c', 'd'].map(post))

    expect(slugs(readNext)).toEqual(['a', 'b', 'c'])
    expect(slugs(rail)).toEqual(['d'])
  })

  it('leaves the rail empty rather than repeat a post already shown', () => {
    const { readNext, rail } = splitRelated(['a', 'b', 'c'].map(post))

    expect(slugs(readNext)).toEqual(['a', 'b', 'c'])
    expect(rail).toEqual([])
  })

  it('survives a tag with nothing else in it', () => {
    expect(splitRelated([])).toEqual({ readNext: [], rail: [] })
  })

  it('asks for exactly what the two surfaces can show', () => {
    expect(RELATED_QUERY_LIMIT).toBe(READ_NEXT_COUNT + RAIL_COUNT)
    expect(
      slugs(
        splitRelated(Array.from({ length: 9 }, (_, i) => post(`p${i}`))).rail,
      ),
    ).toHaveLength(RAIL_COUNT)
  })
})
