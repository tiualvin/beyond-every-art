import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { Breadcrumb } from '../../app/(frontend)/components/breadcrumb'
import { articleBreadcrumbs, primaryTopic } from '../../lib/seo/breadcrumbs'
import { buildBreadcrumbListJsonLd } from '../../lib/seo/jsonld'
import { absoluteUrl } from '../../lib/seo/site'

// What `next.config.ts`'s `trailingSlash: true` compiles into the app. Without
// it `next/link` renders `/tag/palette` here and `/tag/palette/` in production,
// and these tests are about the exact hrefs a crawler follows.
vi.stubEnv('__NEXT_TRAILING_SLASH', 'true')

const SITE = 'https://www.beyondeveryart.com'

const palette = { name: 'Palette', slug: 'palette' }
const featured = { name: 'Featured', slug: 'featured' }
const internal = { name: '#hidden', slug: 'hash-hidden' }

describe('primaryTopic', () => {
  it('is the first tag when that tag is a public subject', () => {
    expect(primaryTopic([palette, featured])).toBe(palette)
  })

  // Ghost's internal tags were never public, and `featured` names a placement.
  // Neither is a place a reader goes "up" to from an article.
  it('skips Ghost internal tags and workflow tags', () => {
    expect(primaryTopic([internal, featured, palette])).toBe(palette)
  })

  it('is null when nothing public is left', () => {
    expect(primaryTopic([internal, featured])).toBeNull()
    expect(primaryTopic([])).toBeNull()
  })
})

describe('articleBreadcrumbs', () => {
  const post = {
    title: 'What Ultramarine Cost',
    slug: 'what-ultramarine-cost',
    tags: [featured, palette],
  }

  it('is Home › primary topic › title, each pointing at its real page', () => {
    expect(articleBreadcrumbs(post)).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Palette', path: '/tag/palette/' },
      { name: 'What Ultramarine Cost', path: '/what-ultramarine-cost/' },
    ])
  })

  it('drops the middle crumb rather than inventing one', () => {
    expect(articleBreadcrumbs({ ...post, tags: [featured] })).toEqual([
      { name: 'Home', path: '/' },
      { name: 'What Ultramarine Cost', path: '/what-ultramarine-cost/' },
    ])
  })
})

describe('buildBreadcrumbListJsonLd', () => {
  it('numbers each item from one and gives every item its URL', () => {
    const data = buildBreadcrumbListJsonLd({
      items: [
        { name: 'Home', url: `${SITE}/` },
        { name: 'Palette', url: `${SITE}/tag/palette/` },
      ],
    })
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Palette',
          item: `${SITE}/tag/palette/`,
        },
      ],
    })
  })
})

// Google asks that breadcrumb markup match the visible trail. Both are built
// from `articleBreadcrumbs`, and this reads them back from what actually
// renders, so a change to either side that makes them disagree fails here.
describe('the visible trail and the JSON-LD', () => {
  const crumbs = articleBreadcrumbs({
    title: 'Black & White: A <History>',
    slug: 'black-and-white',
    tags: [palette],
  })
  const html = renderToStaticMarkup(<Breadcrumb crumbs={crumbs} />)
  const jsonLd = buildBreadcrumbListJsonLd({
    items: crumbs.map((c) => ({
      name: c.name,
      url: absoluteUrl(c.path, SITE),
    })),
  }) as { itemListElement: { name: string; item: string }[] }

  const visible = [
    ...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g),
  ].map(([, href, text]) => ({
    href,
    text: text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  }))

  it('names the same pages, in the same order, with the same text', () => {
    expect(visible).toEqual(
      jsonLd.itemListElement.map((item) => ({
        href: new URL(item.item).pathname,
        text: item.name,
      })),
    )
  })

  it('is a labelled nav whose last crumb is the current page', () => {
    expect(html).toMatch(/^<nav aria-label="Breadcrumb"/)
    expect(html).toContain('aria-current="page"')
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })

  it('hides the separators from assistive technology', () => {
    expect(
      html.match(/<span class="breadcrumb__sep" aria-hidden="true">/g),
    ).toHaveLength(2)
  })
})
