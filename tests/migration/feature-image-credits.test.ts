import { describe, expect, it } from 'vitest'

import {
  captionToPlainText,
  collectFeatureImageCredits,
} from '../../lib/migration/feature-image-credits'
import { parseGhostExport } from '../../lib/migration/ghost-export'

// The exact shape the live export carries, down to the tracking parameters.
const REAL_CAPTION =
  '<span style="white-space: pre-wrap;">Photo by </span>' +
  '<a href="https://unsplash.com/@shhiscat?utm_source=ghost&amp;' +
  'utm_medium=referral&amp;utm_campaign=api-credit">' +
  '<span style="white-space: pre-wrap;">Carolina</span></a>' +
  '<span style="white-space: pre-wrap;"> / Unsplash</span>'

function exportWith(
  posts: unknown[],
  postsMeta: unknown[],
): ReturnType<typeof parseGhostExport> {
  return parseGhostExport({ data: { posts, posts_meta: postsMeta } })
}

describe('captionToPlainText', () => {
  it('reduces a real Ghost credit to the text a reader saw', () => {
    expect(captionToPlainText(REAL_CAPTION)).toBe(
      'Photo by Carolina / Unsplash',
    )
  })

  it('drops the photographer link but keeps the photographer', () => {
    expect(captionToPlainText(REAL_CAPTION)).toContain('Carolina')
    expect(captionToPlainText(REAL_CAPTION)).not.toContain('unsplash.com/@')
    expect(captionToPlainText(REAL_CAPTION)).not.toContain('utm_source')
  })

  it('decodes entities after stripping tags, not before', () => {
    // Decoding first would turn this into a tag the stripper then eats.
    expect(captionToPlainText('<span>a &lt;b&gt; c</span>')).toBe('a <b> c')
    expect(captionToPlainText('Rembrandt &amp; Vermeer')).toBe(
      'Rembrandt & Vermeer',
    )
  })

  it('collapses the whitespace Ghost pre-wrap spans leave behind', () => {
    expect(captionToPlainText('<span>Photo  by</span>\n<span>  X</span>')).toBe(
      'Photo by X',
    )
  })

  it('treats a caption of pure markup as empty', () => {
    expect(captionToPlainText('<span style="x"></span>')).toBe('')
    expect(captionToPlainText(null)).toBe('')
    expect(captionToPlainText('')).toBe('')
  })
})

describe('collectFeatureImageCredits', () => {
  it('joins posts_meta to posts and keys the result by image URL', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [{ id: 'p1', slug: 'a-post', feature_image: 'https://img/one.jpg' }],
        [{ post_id: 'p1', feature_image_caption: REAL_CAPTION }],
      ),
    )
    expect(result.credits).toEqual([
      {
        ghostURL: 'https://img/one.jpg',
        credit: 'Photo by Carolina / Unsplash',
        slug: 'a-post',
        kind: 'post',
      },
    ])
  })

  it('marks a page as a page, since Ghost keeps both in one table', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [
          {
            id: 'p1',
            slug: 'about',
            type: 'page',
            feature_image: 'https://img/one.jpg',
          },
        ],
        [{ post_id: 'p1', feature_image_caption: '<span>Photo by X</span>' }],
      ),
    )
    expect(result.credits[0].kind).toBe('page')
  })

  it('skips a post whose meta row has no caption', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [{ id: 'p1', slug: 'a', feature_image: 'https://img/one.jpg' }],
        [{ post_id: 'p1', meta_title: 'Only a title here' }],
      ),
    )
    expect(result.credits).toEqual([])
  })

  it('skips a post with a caption but no feature image', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [{ id: 'p1', slug: 'a' }],
        [{ post_id: 'p1', feature_image_caption: REAL_CAPTION }],
      ),
    )
    expect(result.credits).toEqual([])
  })

  it('reports a caption that was markup with no text', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [{ id: 'p1', slug: 'empty-caption', feature_image: 'https://i/1.jpg' }],
        [{ post_id: 'p1', feature_image_caption: '<span style="x"></span>' }],
      ),
    )
    expect(result.credits).toEqual([])
    expect(result.empty).toEqual(['empty-caption'])
  })

  it('collapses two posts sharing an image, since media dedupes on ghostURL', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [
          { id: 'p1', slug: 'first', feature_image: 'https://img/shared.jpg' },
          { id: 'p2', slug: 'second', feature_image: 'https://img/shared.jpg' },
        ],
        [
          { post_id: 'p1', feature_image_caption: '<span>Photo by A</span>' },
          { post_id: 'p2', feature_image_caption: '<span>Photo by A</span>' },
        ],
      ),
    )
    expect(result.credits).toHaveLength(1)
    expect(result.conflicts).toEqual([])
  })

  it('reports rather than silently picks when a shared image disagrees', () => {
    const result = collectFeatureImageCredits(
      exportWith(
        [
          { id: 'p1', slug: 'first', feature_image: 'https://img/shared.jpg' },
          { id: 'p2', slug: 'second', feature_image: 'https://img/shared.jpg' },
        ],
        [
          { post_id: 'p1', feature_image_caption: '<span>Photo by A</span>' },
          { post_id: 'p2', feature_image_caption: '<span>Photo by B</span>' },
        ],
      ),
    )
    expect(result.credits).toHaveLength(1)
    expect(result.credits[0].credit).toBe('Photo by A')
    expect(result.conflicts).toEqual([
      {
        ghostURL: 'https://img/shared.jpg',
        credits: ['Photo by A', 'Photo by B'],
      },
    ])
  })

  it('reads the wrapped Ghost 5.x export shape too', () => {
    const ghost = parseGhostExport({
      db: [
        {
          data: {
            posts: [
              { id: 'p1', slug: 'a', feature_image: 'https://img/one.jpg' },
            ],
            posts_meta: [
              {
                post_id: 'p1',
                feature_image_caption: '<span>Photo by X</span>',
              },
            ],
          },
        },
      ],
    })
    expect(collectFeatureImageCredits(ghost).credits[0].credit).toBe(
      'Photo by X',
    )
  })
})
