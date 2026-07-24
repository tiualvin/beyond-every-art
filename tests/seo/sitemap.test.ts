import { describe, expect, it } from 'vitest'

import { buildSitemapEntries } from '../../lib/seo/sitemap'

describe('buildSitemapEntries', () => {
  const siteUrl = 'https://beyondeveryart.com'

  it('always includes the homepage first', () => {
    const entries = buildSitemapEntries({ siteUrl })
    expect(entries[0]).toEqual({
      url: 'https://beyondeveryart.com/',
      changeFrequency: 'daily',
      priority: 1,
    })
  })

  it('builds trailing-slash URLs for posts and pages with last-modified dates', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      posts: [
        {
          slug: 'titanium-white',
          updatedAt: '2025-05-21T00:00:00.000Z',
          publishedAt: '2025-05-20T00:00:00.000Z',
        },
      ],
      pages: [{ slug: 'about', publishedAt: '2024-01-01T00:00:00.000Z' }],
    })

    const post = entries.find((e) => e.url.includes('titanium-white'))
    const page = entries.find((e) => e.url.includes('about'))

    expect(post?.url).toBe('https://beyondeveryart.com/titanium-white/')
    expect(post?.lastModified).toBe('2025-05-21T00:00:00.000Z')
    expect(page?.url).toBe('https://beyondeveryart.com/about/')
    // Falls back to publishedAt when updatedAt is absent.
    expect(page?.lastModified).toBe('2024-01-01T00:00:00.000Z')
  })

  it('skips documents without a slug and tolerates invalid dates', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      posts: [
        { slug: '', publishedAt: '2025-01-01T00:00:00.000Z' },
        { slug: 'good', updatedAt: 'not-a-date' },
      ],
    })
    expect(entries).toHaveLength(2) // homepage + 'good'
    const good = entries.find((e) => e.url.includes('good'))
    expect(good?.lastModified).toBeUndefined()
  })
})
