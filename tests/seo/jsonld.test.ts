import { describe, expect, it } from 'vitest'

import { buildArticleJsonLd, serializeJsonLd } from '../../lib/seo/jsonld'

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
