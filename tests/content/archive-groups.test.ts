import { describe, expect, it } from 'vitest'

import { groupByMonth } from '../../app/(frontend)/components/archive-groups'
import type { PostCard } from '../../lib/content/queries'

function post(slug: string, publishedAt: string | null): PostCard {
  return {
    id: slug,
    slug,
    title: slug,
    excerpt: '',
    publishedAt,
    featured: false,
    authors: [],
    tags: [],
    image: null,
    readingTime: 1,
    visibility: 'public',
  }
}

describe('groupByMonth', () => {
  it('collects consecutive posts from the same month', () => {
    const groups = groupByMonth([
      post('a', '2026-08-06T09:00:00.000Z'),
      post('b', '2026-08-01T09:00:00.000Z'),
      post('c', '2026-07-29T09:00:00.000Z'),
    ])

    expect(groups.map((g) => g.label)).toEqual(['August 2026', 'July 2026'])
    expect(groups[0].posts.map((p) => p.slug)).toEqual(['a', 'b'])
    expect(groups[1].posts.map((p) => p.slug)).toEqual(['c'])
  })

  it('reads the month in UTC, so a late-night post stays in its own month', () => {
    // 23:30 on the 31st is already September in a positive offset; grouping by
    // local time would move it and split a month in two.
    const [group] = groupByMonth([post('a', '2026-08-31T23:30:00.000Z')])
    expect(group.label).toBe('August 2026')
  })

  it('keeps the order it was given rather than sorting', () => {
    const groups = groupByMonth([
      post('older', '2026-07-01T09:00:00.000Z'),
      post('newer', '2026-08-01T09:00:00.000Z'),
    ])
    expect(groups.map((g) => g.label)).toEqual(['July 2026', 'August 2026'])
  })

  it('buckets posts with no usable date together', () => {
    const groups = groupByMonth([post('a', null), post('b', 'not a date')])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Undated')
  })

  it('returns nothing for an empty archive', () => {
    expect(groupByMonth([])).toEqual([])
  })
})
