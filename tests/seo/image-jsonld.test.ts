import { describe, expect, it } from 'vitest'

import { bodyImageJsonLd } from '../../lib/seo/image-jsonld'
import { buildImageObjectJsonLd } from '../../lib/seo/jsonld'

const SITE = 'https://www.beyondeveryart.com'

describe('buildImageObjectJsonLd', () => {
  it("follows Google's image metadata shape", () => {
    expect(
      buildImageObjectJsonLd({
        contentUrl: `${SITE}/api/media/file/cabinet.jpg`,
        creator: 'Ana Ruiz',
        creditText: 'Photo by Ana Ruiz / Unsplash',
        copyrightNotice: '© 2024 Ana Ruiz',
        license: 'https://unsplash.com/license',
        acquireLicensePage: 'https://unsplash.com/photos/abc',
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      contentUrl: `${SITE}/api/media/file/cabinet.jpg`,
      license: 'https://unsplash.com/license',
      acquireLicensePage: 'https://unsplash.com/photos/abc',
      creditText: 'Photo by Ana Ruiz / Unsplash',
      creator: { '@type': 'Person', name: 'Ana Ruiz' },
      copyrightNotice: '© 2024 Ana Ruiz',
    })
  })

  it('omits what the image does not say', () => {
    expect(
      buildImageObjectJsonLd({ contentUrl: 'u', creditText: 'Courtesy A' }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      contentUrl: 'u',
      creditText: 'Courtesy A',
    })
  })

  // Google requires one of these four; an acquire page alone is not one.
  it('is null without creator, credit, copyright or licence', () => {
    expect(buildImageObjectJsonLd({ contentUrl: 'u' })).toBeNull()
    expect(
      buildImageObjectJsonLd({
        contentUrl: 'u',
        creditText: '  ',
        acquireLicensePage: 'https://x.example/',
      }),
    ).toBeNull()
  })
})

const media = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  url: `/api/media/file/image-${id}.jpg/`,
  alt: 'alt text here',
  width: 1200,
  height: 800,
  credit: 'Photo by Ana Ruiz',
  creator: 'Ana Ruiz',
  licenseURL: 'https://unsplash.com/license',
  ...extra,
})
const upload = (value: unknown, fields: Record<string, unknown> = {}) => ({
  type: 'upload',
  relationTo: 'media',
  value,
  fields,
})

describe('bodyImageJsonLd', () => {
  it('describes each body image with the credit the page shows', () => {
    const nodes = bodyImageJsonLd(
      {
        kind: 'lexical',
        content: {
          root: {
            children: [
              upload(media(1)),
              upload(media(2), { credit: 'Courtesy the Forbes' }),
            ],
          },
        },
      },
      SITE,
    )
    expect(nodes.map((node) => [node.contentUrl, node.creditText])).toEqual([
      [`${SITE}/api/media/file/image-1.jpg`, 'Photo by Ana Ruiz'],
      [`${SITE}/api/media/file/image-2.jpg`, 'Courtesy the Forbes'],
    ])
  })

  it('describes a picture placed twice once, and skips one with nothing to say', () => {
    const bare = media(3, { credit: null, creator: null, licenseURL: null })
    const nodes = bodyImageJsonLd(
      {
        kind: 'lexical',
        content: {
          root: {
            children: [upload(media(1)), upload(media(1)), upload(bare)],
          },
        },
      },
      SITE,
    )
    expect(nodes).toHaveLength(1)
  })

  it('refuses a licence URL that is not https', () => {
    const [node] = bodyImageJsonLd(
      {
        kind: 'lexical',
        content: {
          root: {
            children: [upload(media(4, { licenseURL: 'javascript:alert(1)' }))],
          },
        },
      },
      SITE,
    )
    expect(node).not.toHaveProperty('license')
  })

  it('says nothing about preserved Ghost HTML', () => {
    expect(
      bodyImageJsonLd({ kind: 'html', html: '<img src="/x.jpg">' }, SITE),
    ).toEqual([])
  })
})
