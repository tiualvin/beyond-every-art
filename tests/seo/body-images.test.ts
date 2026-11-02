import { describe, expect, it } from 'vitest'

import {
  BOOKMARK_BLOCK,
  FEATURE_LIST_BLOCK,
  GALLERY_BLOCK,
  MEDIA_TEXT_BLOCK,
} from '../../blocks/schema'
import type { ArticleBody } from '../../lib/content/body'
import { collectBodyImages } from '../../lib/seo/body-images'

const siteUrl = 'https://www.beyondeveryart.com'

/**
 * A media record as a `depth: 1` query returns it — including the trailing
 * slash Payload stores on `url` and the file does not live at.
 */
function media(filename: string, extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    filename,
    url: `/api/media/file/${filename}/`,
    ...extra,
  }
}

function lexical(children: unknown[]): ArticleBody {
  return { kind: 'lexical', content: { root: { children } } as never }
}

describe('collectBodyImages', () => {
  it('resolves an upload node to an absolute URL with no trailing slash', () => {
    const body = lexical([
      {
        type: 'upload',
        relationTo: 'media',
        value: media('verdigris-pigment.png'),
      },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/verdigris-pigment.png',
    ])
  })

  it('finds images inside a gallery, in order', () => {
    const body = lexical([
      {
        type: 'block',
        fields: {
          blockType: GALLERY_BLOCK,
          images: [
            { image: media('one.png') },
            { image: media('two.png') },
            { image: null },
          ],
        },
      },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/one.png',
      'https://www.beyondeveryart.com/api/media/file/two.png',
    ])
  })

  it('finds the image in image-and-text, feature list and bookmark modules', () => {
    const body = lexical([
      {
        type: 'block',
        fields: { blockType: MEDIA_TEXT_BLOCK, image: media('text.png') },
      },
      {
        type: 'block',
        fields: {
          blockType: FEATURE_LIST_BLOCK,
          items: [
            { title: 'One', image: media('item-one.png') },
            { title: 'Two', image: media('item-two.png') },
          ],
        },
      },
      {
        type: 'block',
        fields: { blockType: BOOKMARK_BLOCK, image: media('card.png') },
      },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/text.png',
      'https://www.beyondeveryart.com/api/media/file/item-one.png',
      'https://www.beyondeveryart.com/api/media/file/item-two.png',
      'https://www.beyondeveryart.com/api/media/file/card.png',
    ])
  })

  it('reaches an upload nested below the top level, in document order', () => {
    const body = lexical([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'before' },
          { type: 'upload', value: media('inline.png') },
        ],
      },
      { type: 'upload', value: media('after.png') },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/inline.png',
      'https://www.beyondeveryart.com/api/media/file/after.png',
    ])
  })

  it('drops a relationship the query did not populate', () => {
    // `depth: 0` leaves the value as a bare id. There is no URL to give and
    // inventing one would name an image that does not exist.
    const body = lexical([{ type: 'upload', relationTo: 'media', value: 42 }])

    expect(collectBodyImages(body, siteUrl)).toEqual([])
  })

  it('drops modules that carry an upload which is not one of the page’s images', () => {
    const body = lexical([
      {
        type: 'block',
        fields: { blockType: 'keyFacts', image: media('not-an-image.png') },
      },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([])
  })

  it('lists a repeated upload once', () => {
    const body = lexical([
      { type: 'upload', value: media('same.png') },
      {
        type: 'block',
        fields: { blockType: MEDIA_TEXT_BLOCK, image: media('same.png') },
      },
    ])

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/same.png',
    ])
  })

  it('reads images out of preserved Ghost markup', () => {
    const body: ArticleBody = {
      kind: 'html',
      html: '<p>Text</p><img src="/api/media/file/legacy.png" alt="Legacy"><img class="x" src="https://cdn.example.com/remote.jpg">',
    }

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://www.beyondeveryart.com/api/media/file/legacy.png',
      'https://cdn.example.com/remote.jpg',
    ])
  })

  it('skips an inline data payload and a non-image scheme', () => {
    const body: ArticleBody = {
      kind: 'html',
      html: '<img src="data:image/png;base64,AAAA"><img src="javascript:alert(1)">',
    }

    expect(collectBodyImages(body, siteUrl)).toEqual([])
  })

  it('repairs a src wrapped in the escaped quotes one migrated body carries', () => {
    // `repairEscapedQuotes` exists because a migrated post arrived with every
    // link wrapped this way. A src left wrapped resolves against the origin
    // into a path that 404s, so it is dropped rather than named.
    const body: ArticleBody = {
      kind: 'html',
      html: '<img src="\\&quot;https://cdn.example.com/photo.jpg\\&quot;">',
    }

    expect(collectBodyImages(body, siteUrl)).toEqual([
      'https://cdn.example.com/photo.jpg',
    ])
  })

  it('does not mistake a src-less image for the page itself', () => {
    const body: ArticleBody = { kind: 'html', html: '<img alt="nothing">' }

    expect(collectBodyImages(body, siteUrl)).toEqual([])
  })

  it('returns nothing for an empty body', () => {
    expect(collectBodyImages({ kind: 'empty' }, siteUrl)).toEqual([])
  })
})
