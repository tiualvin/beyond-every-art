import { describe, expect, it } from 'vitest'

import {
  bodyMediaIds,
  legacyMediaPaths,
  postImagePaths,
  postMediaIds,
} from '../../lib/seo/sitemap-images'

const upload = (value: unknown) => ({
  type: 'upload',
  relationTo: 'media',
  value,
})
const paragraph = (text: string) => ({
  type: 'paragraph',
  children: [{ type: 'text', text }],
})
const rich = (...children: unknown[]) => ({ root: { children } })

const urls = new Map([
  ['1', '/api/media/file/featured.jpg'],
  ['2', '/api/media/file/body-a.jpg'],
  ['3', '/api/media/file/body-b.jpg'],
])

describe('postImagePaths', () => {
  it('lists the featured image, then the body images, each once', () => {
    const post = {
      featuredImage: 1,
      content: rich(paragraph('x'), upload(2), upload({ id: 3 }), upload(2)),
    }
    expect(postMediaIds(post)).toEqual(['1', '2', '3', '2'])
    expect(postImagePaths(post, urls)).toEqual([
      '/api/media/file/featured.jpg',
      '/api/media/file/body-a.jpg',
      '/api/media/file/body-b.jpg',
    ])
  })

  // A crawler gets the opening of a gated post. Listing a picture from further
  // down is a claim the page contradicts.
  it('lists only the featured image for a members-only or paid post', () => {
    for (const visibility of ['members', 'paid']) {
      expect(
        postImagePaths(
          { featuredImage: 1, content: rich(upload(2)), visibility },
          urls,
        ),
      ).toEqual(['/api/media/file/featured.jpg'])
    }
  })

  it('skips an image whose record is gone', () => {
    expect(
      postImagePaths({ featuredImage: 99, content: rich(upload(2)) }, urls),
    ).toEqual(['/api/media/file/body-a.jpg'])
  })

  it('reads the Ghost HTML only when the rich text is empty, as the page does', () => {
    const legacyHTML =
      '<p>x</p><img src="https://www.beyondeveryart.com/api/media/file/old.jpg/">'
    expect(postImagePaths({ content: rich(), legacyHTML }, urls)).toEqual([
      '/api/media/file/old.jpg',
    ])
    expect(
      postImagePaths(
        { content: rich(paragraph('new body')), legacyHTML },
        urls,
      ),
    ).toEqual([])
  })
})

describe('bodyMediaIds', () => {
  it('finds images nested in a list, and ignores other uploads', () => {
    expect(
      bodyMediaIds(
        rich({
          type: 'list',
          children: [
            { type: 'listitem', children: [upload(4)] },
            { type: 'upload', relationTo: 'users', value: 5 },
          ],
        }),
      ),
    ).toEqual(['4'])
  })
})

describe('legacyMediaPaths', () => {
  it('keeps only what this site serves from its media path', () => {
    expect(
      legacyMediaPaths(
        '<img src="/api/media/file/a.png"><img alt="x" src="/content/images/b.png">' +
          '<img src="https://images.unsplash.com/photo-1">',
      ),
    ).toEqual(['/api/media/file/a.png'])
  })
})
