import { describe, expect, it } from 'vitest'

import { stripMediaUrlSlashes } from '../../lib/media/urls'

describe('stripMediaUrlSlashes', () => {
  it('removes the trailing slash from the original and every derivative', () => {
    expect(
      stripMediaUrlSlashes({
        url: '/api/media/file/ultramarine.jpg/',
        sizes: {
          card: { url: '/api/media/file/ultramarine-768.jpg/', width: 768 },
          og: { url: '/api/media/file/ultramarine-1200x630.jpg/', height: 630 },
        },
      }),
    ).toEqual({
      url: '/api/media/file/ultramarine.jpg',
      sizes: {
        card: { url: '/api/media/file/ultramarine-768.jpg', width: 768 },
        og: { url: '/api/media/file/ultramarine-1200x630.jpg', height: 630 },
      },
    })
  })

  it('leaves a correctly formed document untouched', () => {
    const clean = {
      url: '/api/media/file/ultramarine.jpg',
      sizes: { card: { url: '/api/media/file/ultramarine-768.jpg' } },
    }
    expect(stripMediaUrlSlashes(clean)).toEqual(clean)
  })

  it('tolerates documents with no URL yet and no sizes', () => {
    expect(stripMediaUrlSlashes({ alt: 'orphaned' })).toEqual({
      alt: 'orphaned',
    })
    expect(
      stripMediaUrlSlashes({ url: '/api/media/file/x.png/', sizes: null }),
    ).toEqual({ url: '/api/media/file/x.png', sizes: null })
  })

  it('does not mutate the input', () => {
    const input = {
      url: '/api/media/file/x.png/',
      sizes: { card: { url: '/a/' } },
    }
    stripMediaUrlSlashes(input)
    expect(input.url).toBe('/api/media/file/x.png/')
    expect(input.sizes.card.url).toBe('/a/')
  })
})
