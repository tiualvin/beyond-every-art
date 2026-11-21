import { describe, expect, it } from 'vitest'

import {
  alternatesForPath,
  hreflangFor,
  liveLocalesOf,
  translatedSlugs,
  type LocaleIndex,
} from '../../lib/i18n/alternates'
import { decideLink, localizeBodyLinks } from '../../lib/i18n/links'
import { buildSitemapEntries } from '../../lib/seo/sitemap'

const NOW = new Date('2026-11-17T12:00:00Z')
const SITE = 'https://www.beyondeveryart.com'

describe('which languages a post is live in', () => {
  const doc = {
    _status: 'published',
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    slug: { en: 'blue', es: 'azul', de: 'blau', id: 'biru' },
    modifiedAt: { en: '2026-02-01T00:00:00Z', es: '2026-03-01T00:00:00Z' },
    translationStatus: { es: 'published', de: 'draft', id: 'published' },
    translationPublishedAt: {
      es: '2026-03-01T00:00:00Z',
      id: '2027-01-01T00:00:00Z',
    },
  }

  it('counts a translation only when published and due', () => {
    const live = liveLocalesOf(doc, NOW)
    expect(Object.keys(live).sort()).toEqual(['en', 'es'])
    expect(live.es).toEqual({
      slug: 'azul',
      publishedAt: '2026-03-01T00:00:00Z',
      modifiedAt: '2026-03-01T00:00:00Z',
    })
  })

  it('serves no translation of an article whose English is not live', () => {
    expect(liveLocalesOf({ ...doc, _status: 'draft' }, NOW)).toEqual({})
    expect(
      liveLocalesOf({ ...doc, publishedAt: '2027-06-01T00:00:00Z' }, NOW),
    ).toEqual({})
  })
})

const index: LocaleIndex = {
  posts: [
    {
      id: '1',
      noindex: false,
      tagIds: ['10'],
      authorIds: ['20'],
      locales: {
        en: {
          slug: 'blue',
          publishedAt: null,
          modifiedAt: '2026-02-01T00:00:00.000Z',
        },
        es: {
          slug: 'azul',
          publishedAt: null,
          modifiedAt: '2026-03-01T00:00:00.000Z',
        },
      },
    },
    {
      id: '2',
      noindex: false,
      tagIds: ['10'],
      authorIds: ['20'],
      locales: {
        en: {
          slug: 'red',
          publishedAt: null,
          modifiedAt: '2026-02-01T00:00:00.000Z',
        },
      },
    },
  ],
  tags: [
    {
      id: '10',
      locales: {
        en: { slug: 'colour', name: 'Colour' },
        es: { slug: 'color', name: 'Color' },
      },
    },
  ],
  authors: [{ id: '20', slug: 'livia', locales: ['en', 'es'] }],
}

describe('alternates for a path', () => {
  it('pairs a translated article with its English original, both ways', () => {
    const fromEnglish = alternatesForPath(index, '/blue/')
    const fromSpanish = alternatesForPath(index, '/es/azul/')
    expect(fromEnglish).toEqual({ en: '/blue/', es: '/es/azul/' })
    expect(fromSpanish).toEqual(fromEnglish)
  })

  it('has nothing to say about a page in one language', () => {
    expect(alternatesForPath(index, '/red/')).toBeNull()
    expect(alternatesForPath(index, '/es/rojo/')).toBeNull()
    expect(alternatesForPath(index, '/about/')).toBeNull()
  })

  it('covers home pages and archives', () => {
    expect(alternatesForPath(index, '/')).toEqual({ en: '/', es: '/es/' })
    expect(alternatesForPath(index, '/es/tag/color/')).toEqual({
      en: '/tag/colour/',
      es: '/es/tag/color/',
    })
    expect(alternatesForPath(index, '/author/livia/')).toEqual({
      en: '/author/livia/',
      es: '/es/author/livia/',
    })
  })

  it('builds reciprocal hreflang with x-default at English', () => {
    expect(hreflangFor(alternatesForPath(index, '/es/azul/'), SITE)).toEqual({
      en: `${SITE}/blue/`,
      es: `${SITE}/es/azul/`,
      'x-default': `${SITE}/blue/`,
    })
    expect(hreflangFor(null, SITE)).toBeUndefined()
  })
})

describe('links in a translated body', () => {
  const context = {
    locale: 'es' as const,
    siteUrl: SITE,
    translated: translatedSlugs(index, 'es'),
    liveHere: new Set(['azul']),
    withheldEnglish: new Set(['draft-piece']),
  }

  it('points an English article with a translation at the translation', () => {
    expect(decideLink('/blue/', context)).toEqual({ href: '/es/azul/' })
    expect(decideLink(`${SITE}/blue/#section`, context)).toEqual({
      href: '/es/azul/#section',
    })
  })

  it('leaves an untranslated English article as an English link', () => {
    expect(decideLink('/red/', context)).toBe('keep')
    expect(decideLink('https://example.com/blue/', context)).toBe('keep')
  })

  it('unlinks what would 404', () => {
    expect(decideLink('/draft-piece/', context)).toBe('unlink')
    expect(decideLink('/es/no-traducido/', context)).toBe('unlink')
    expect(decideLink('/es/azul/', context)).toBe('keep')
  })

  it('rewrites links inside modules too, without touching the stored body', () => {
    const content = {
      root: {
        children: [
          {
            type: 'block',
            fields: {
              items: [
                {
                  answer: {
                    root: {
                      children: [
                        {
                          type: 'link',
                          fields: { url: '/blue/' },
                          children: [{ text: 'azul' }],
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    }
    const before = JSON.stringify(content)
    const out = localizeBodyLinks(
      { kind: 'lexical', content } as never,
      context,
    )
    expect(JSON.stringify(out)).toContain('/es/azul/')
    expect(JSON.stringify(content)).toBe(before)
  })
})

describe('the sitemap with translations', () => {
  const posts = [
    { slug: 'blue', updatedAt: '2026-02-01T00:00:00.000Z' },
    { slug: 'red', updatedAt: '2026-02-01T00:00:00.000Z' },
  ]

  it('keeps the English URL set exactly as it was', () => {
    const without = buildSitemapEntries({ siteUrl: SITE, posts })
    const withLocales = buildSitemapEntries({
      siteUrl: SITE,
      posts,
      locales: index,
    })
    const english = (entries: typeof without) =>
      entries.map((e) => e.url).filter((url) => !/\/(es|id|de)\//.test(url))
    expect(english(withLocales)).toEqual(english(without))
  })

  it('lists each translation with the same alternates its page carries', () => {
    const entries = buildSitemapEntries({
      siteUrl: SITE,
      posts,
      tags: [{ slug: 'colour' }],
      locales: index,
    })
    const spanish = entries.find((e) => e.url === `${SITE}/es/azul/`)
    const english = entries.find((e) => e.url === `${SITE}/blue/`)
    expect(spanish?.lastModified).toBe('2026-03-01T00:00:00.000Z')
    expect(spanish?.alternates?.languages).toEqual(
      hreflangFor(alternatesForPath(index, '/es/azul/'), SITE),
    )
    expect(english?.alternates).toEqual(spanish?.alternates)
    // An article in English only gets no alternates at all.
    expect(
      entries.find((e) => e.url === `${SITE}/red/`)?.alternates,
    ).toBeUndefined()
    expect(entries.map((e) => e.url)).toEqual(
      expect.arrayContaining([
        `${SITE}/es/`,
        `${SITE}/es/tag/color/`,
        `${SITE}/es/author/livia/`,
      ]),
    )
  })

  it('lists nothing for a language with nothing live', () => {
    const entries = buildSitemapEntries({
      siteUrl: SITE,
      posts,
      locales: index,
    })
    expect(entries.some((e) => /\/(de|id)\//.test(e.url))).toBe(false)
  })

  it('keeps every translation of a noindexed article out', () => {
    const entries = buildSitemapEntries({
      siteUrl: SITE,
      posts: [{ slug: 'blue', noindex: true }, posts[1]!],
      locales: index,
    })
    expect(entries.some((e) => e.url.includes('/es/azul/'))).toBe(false)
  })
})
