import { describe, expect, it } from 'vitest'

import { buildSitemapEntries } from '../../lib/seo/sitemap'

describe('buildSitemapEntries', () => {
  const siteUrl = 'https://beyondeveryart.com'

  it('always includes the homepage and the journal archive first', () => {
    const entries = buildSitemapEntries({ siteUrl })
    expect(entries).toEqual([
      {
        url: 'https://beyondeveryart.com/',
        changeFrequency: 'daily',
        priority: 1,
      },
      {
        url: 'https://beyondeveryart.com/journal',
        changeFrequency: 'daily',
        priority: 0.8,
      },
    ])
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
    expect(entries).toHaveLength(3) // homepage + journal + 'good'
    const good = entries.find((e) => e.url.includes('good'))
    expect(good?.lastModified).toBeUndefined()
  })

  it('builds trailing-slash tag and author archive URLs', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      tags: [{ slug: 'materials' }],
      authors: [{ slug: 'livia-calderon' }],
    })
    expect(entries.map((e) => e.url)).toEqual([
      'https://beyondeveryart.com/',
      'https://beyondeveryart.com/journal',
      'https://beyondeveryart.com/tag/materials/',
      'https://beyondeveryart.com/author/livia-calderon/',
    ])
  })
})

describe('buildSitemapEntries — apps', () => {
  const siteUrl = 'https://beyondeveryart.com'

  it('lists the overview route only once an app is published', () => {
    const empty = buildSitemapEntries({ siteUrl })
    expect(empty.some((e) => e.url.endsWith('/apps'))).toBe(false)

    const withApps = buildSitemapEntries({
      siteUrl,
      apps: [{ slug: 'dapple', updatedAt: '2026-08-01T00:00:00.000Z' }],
    })
    expect(
      withApps.some((e) => e.url === 'https://beyondeveryart.com/apps'),
    ).toBe(true)
  })

  it('builds app URLs without a trailing slash, matching the route', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      apps: [
        { slug: 'dapple', updatedAt: '2026-08-01T00:00:00.000Z' },
        { slug: 'morrow', publishedAt: '2026-07-02T00:00:00.000Z' },
      ],
    })

    const dapple = entries.find((e) => e.url.endsWith('/apps/dapple'))
    const morrow = entries.find((e) => e.url.endsWith('/apps/morrow'))

    expect(dapple?.url).toBe('https://beyondeveryart.com/apps/dapple')
    expect(dapple?.lastModified).toBe('2026-08-01T00:00:00.000Z')
    // Falls back to publishedAt when updatedAt is absent, like posts do.
    expect(morrow?.lastModified).toBe('2026-07-02T00:00:00.000Z')
  })

  it('skips apps without a slug', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      apps: [{ slug: '' }, { slug: 'dapple' }],
    })
    expect(entries.filter((e) => e.url.includes('/apps/'))).toHaveLength(1)
  })

  it('leaves out posts and pages marked noindex', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      posts: [
        { slug: 'ultramarine' },
        { slug: 'spring-campaign', noindex: true },
      ],
      pages: [{ slug: 'about' }, { slug: 'workshop-offer', noindex: true }],
    })

    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain('https://beyondeveryart.com/ultramarine/')
    expect(urls).toContain('https://beyondeveryart.com/about/')
    expect(urls.some((url) => url.includes('spring-campaign'))).toBe(false)
    expect(urls.some((url) => url.includes('workshop-offer'))).toBe(false)
  })

  it('lists a document whose noindex is absent or false', () => {
    const entries = buildSitemapEntries({
      siteUrl,
      posts: [{ slug: 'ultramarine', noindex: false }, { slug: 'sienna' }],
      pages: [{ slug: 'about', noindex: null }],
    })

    expect(entries).toHaveLength(5)
  })
})
