import { describe, expect, it } from 'vitest'

import {
  buildArticleJsonLd,
  buildCollectionPageJsonLd,
  buildProfilePageJsonLd,
  buildWebPageJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from '../../lib/seo/jsonld'

describe('buildArticleJsonLd', () => {
  const base = {
    url: 'https://beyondeveryart.com/titanium-white/',
    headline: 'Why Titanium White Behaves Differently',
    siteName: 'Beyond Every Art',
    siteUrl: 'https://beyondeveryart.com',
  }

  it('builds a schema.org Article with publisher and mainEntityOfPage', () => {
    const data = buildArticleJsonLd(base)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Article')
    expect(data.headline).toBe(base.headline)
    expect(data.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': base.url,
    })
    expect(data.publisher).toEqual({
      '@type': 'Organization',
      name: 'Beyond Every Art',
      url: 'https://beyondeveryart.com',
    })
  })

  it('includes dates and authors when provided', () => {
    const data = buildArticleJsonLd({
      ...base,
      description: 'Two whites.',
      datePublished: '2025-05-20T00:00:00.000Z',
      dateModified: '2025-05-21T00:00:00.000Z',
      authors: ['Livia M. Calderon', ''],
    })
    expect(data.description).toBe('Two whites.')
    expect(data.datePublished).toBe('2025-05-20T00:00:00.000Z')
    expect(data.dateModified).toBe('2025-05-21T00:00:00.000Z')
    expect(data.author).toEqual([
      { '@type': 'Person', name: 'Livia M. Calderon' },
    ])
  })

  it('includes the featured image as a list', () => {
    const data = buildArticleJsonLd({
      ...base,
      image: 'https://beyondeveryart.com/api/media/file/lead-white.jpg',
    })
    expect(data.image).toEqual([
      'https://beyondeveryart.com/api/media/file/lead-white.jpg',
    ])
  })

  it('omits optional fields and the author array when empty', () => {
    const data = buildArticleJsonLd({ ...base, authors: [], image: null })
    expect(data).not.toHaveProperty('description')
    expect(data).not.toHaveProperty('datePublished')
    expect(data).not.toHaveProperty('author')
    expect(data).not.toHaveProperty('image')
  })
})

describe('serializeJsonLd', () => {
  it('escapes characters that could break out of a <script> tag', () => {
    const out = serializeJsonLd({ headline: 'Lead & Titanium </script>' })
    expect(out).not.toContain('</script>')
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).toContain('\\u003c')
    expect(out).toContain('\\u0026')
    // Still valid JSON once parsed back.
    expect(JSON.parse(out).headline).toBe('Lead & Titanium </script>')
  })
})

// The three nodes added on 18 Sep, after the crawl comparison found Ghost
// emitting WebSite on the homepage, Article on pages and Person on author
// archives while this site emitted none of them. `AGENTS.md` lists structured
// data among the things the migration preserves, so each of these is a
// requirement rather than an enhancement.

describe('buildWebSiteJsonLd', () => {
  const base = { siteName: 'Beyond Every Art', siteUrl: 'https://example.com' }

  it('describes the site, which is what Ghost served here', () => {
    const node = buildWebSiteJsonLd(base)

    expect(node['@type']).toBe('WebSite')
    expect(node.name).toBe('Beyond Every Art')
    expect(node.url).toBe('https://example.com')
    expect(node.publisher).toMatchObject({ '@type': 'Organization' })
  })

  it('advertises search only when a path is supplied', () => {
    // Advertising a search endpoint that does not exist is worse than
    // advertising none: the sitelinks search box is the one part of this node
    // Google acts on.
    expect(buildWebSiteJsonLd(base).potentialAction).toBeUndefined()

    const withSearch = buildWebSiteJsonLd({ ...base, searchPath: '/search/' })
    expect(withSearch.potentialAction).toMatchObject({
      '@type': 'SearchAction',
      target: {
        urlTemplate: 'https://example.com/search/?q={search_term_string}',
      },
      // The literal schema.org requires; Google drops the action without it.
      'query-input': 'required name=search_term_string',
    })
  })

  it('does not double the slash when the site URL carries one', () => {
    const node = buildWebSiteJsonLd({
      ...base,
      siteUrl: 'https://example.com/',
      searchPath: '/search/',
    })

    expect(
      (node.potentialAction as { target: { urlTemplate: string } }).target
        .urlTemplate,
    ).toBe('https://example.com/search/?q={search_term_string}')
  })

  it('omits an empty description rather than emitting a blank one', () => {
    expect(
      buildWebSiteJsonLd({ ...base, description: '' }).description,
    ).toBeUndefined()
  })
})

describe('buildWebPageJsonLd', () => {
  const base = {
    url: 'https://example.com/about/',
    name: 'About',
    siteName: 'Beyond Every Art',
    siteUrl: 'https://example.com',
  }

  it('is a WebPage and never an Article', () => {
    // The deliberate departure from Ghost, which emitted Article here. An
    // about page is not editorial, and Article carries expectations — author,
    // publication date, a headline that is news — a page cannot honour.
    // Pinned so that a future pass "fixing" the crawl diff has to argue with
    // a failing test rather than quietly change it.
    const node = buildWebPageJsonLd(base)

    expect(node['@type']).toBe('WebPage')
    expect(node['@type']).not.toBe('Article')
    expect(node.isPartOf).toMatchObject({ '@type': 'WebSite' })
  })

  it('carries a modification date when there is one', () => {
    expect(buildWebPageJsonLd(base).dateModified).toBeUndefined()
    expect(
      buildWebPageJsonLd({ ...base, dateModified: '2026-09-18T00:00:00.000Z' })
        .dateModified,
    ).toBe('2026-09-18T00:00:00.000Z')
    // Null is what the query returns for a page never updated, and it must
    // drop out rather than serialize as `"dateModified": null`.
    expect(
      buildWebPageJsonLd({ ...base, dateModified: null }).dateModified,
    ).toBeUndefined()
  })
})

describe('buildProfilePageJsonLd', () => {
  const base = {
    url: 'https://example.com/author/alvin/',
    name: 'Alvin',
    siteName: 'Beyond Every Art',
    siteUrl: 'https://example.com',
  }

  it("keeps Ghost's Person, as the entity the page is about", () => {
    // Ghost emitted a bare Person. The page is not the person, so the Person
    // moves inside a ProfilePage rather than disappearing — anything reading
    // for it still finds it.
    const node = buildProfilePageJsonLd(base)

    expect(node['@type']).toBe('ProfilePage')
    expect(node.mainEntity).toMatchObject({ '@type': 'Person', name: 'Alvin' })
  })

  it('omits a description the author has not written', () => {
    const node = buildProfilePageJsonLd(base)
    expect(
      (node.mainEntity as Record<string, unknown>).description,
    ).toBeUndefined()

    const described = buildProfilePageJsonLd({
      ...base,
      description: 'Editor.',
    })
    expect((described.mainEntity as Record<string, unknown>).description).toBe(
      'Editor.',
    )
  })
})

describe('buildCollectionPageJsonLd', () => {
  const base = {
    url: 'https://example.com/tag/palette/',
    name: 'Palette',
    siteName: 'Beyond Every Art',
    siteUrl: 'https://example.com',
  }

  it('is a CollectionPage and never a Series', () => {
    // Ghost emitted Series on tag archives. A Series is a work published in
    // parts, in order, by someone who meant it as one. A tag archive is a list
    // of everything filed under a word: no order, no intent, and a post can
    // sit in several at once. Pinned against Series specifically so that a
    // later pass closing the crawl diff has to argue with a failing test.
    const node = buildCollectionPageJsonLd(base)

    expect(node['@type']).toBe('CollectionPage')
    expect(node['@type']).not.toBe('Series')
    expect(node.name).toBe('Palette')
    expect(node.isPartOf).toMatchObject({ '@type': 'WebSite' })
  })

  it('omits a description the topic has not been given', () => {
    expect(buildCollectionPageJsonLd(base).description).toBeUndefined()
    expect(
      buildCollectionPageJsonLd({ ...base, description: 'Colour, mixed.' })
        .description,
    ).toBe('Colour, mixed.')
  })

  it('carries no dateModified, which WebPage may and this may not', () => {
    // The two share a builder. This asserts the shared part did not leak a
    // field a CollectionPage was never given.
    expect(buildCollectionPageJsonLd(base).dateModified).toBeUndefined()
  })
})

describe('every node survives serialization', () => {
  // The escaping in `serializeJsonLd` exists so a value cannot break out of
  // the <script> element. It is applied to these nodes too, so each has to
  // still parse back to the type it claimed.
  it.each([
    [
      'WebSite',
      buildWebSiteJsonLd({ siteName: 'A & B', siteUrl: 'https://x.test' }),
    ],
    [
      'WebPage',
      buildWebPageJsonLd({
        url: 'https://x.test/about/',
        name: 'A </script> B',
        siteName: 'A & B',
        siteUrl: 'https://x.test',
      }),
    ],
    [
      'CollectionPage',
      buildCollectionPageJsonLd({
        url: 'https://x.test/tag/a/',
        name: 'A & B',
        siteName: 'A & B',
        siteUrl: 'https://x.test',
      }),
    ],
    [
      'ProfilePage',
      buildProfilePageJsonLd({
        url: 'https://x.test/author/a/',
        name: 'A & B',
        siteName: 'A & B',
        siteUrl: 'https://x.test',
      }),
    ],
  ])('%s', (type, node) => {
    const out = serializeJsonLd(node)

    expect(out).not.toContain('</script>')
    expect(out).not.toContain('&')
    expect(JSON.parse(out)['@type']).toBe(type)
  })
})
