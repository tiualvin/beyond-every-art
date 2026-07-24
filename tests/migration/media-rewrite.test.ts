import { describe, expect, it } from 'vitest'

import {
  deriveMediaFilename,
  rewriteMediaUrls,
  type MediaRef,
} from '../../lib/migration/media-rewrite'

describe('deriveMediaFilename', () => {
  it('keeps the path basename and drops query strings', () => {
    expect(
      deriveMediaFilename(
        'https://old.ghost.example/content/images/2023/01/ultramarine.jpg?v=2',
      ),
    ).toBe('ultramarine.jpg')
  })

  it('decodes and sanitizes unsafe characters', () => {
    expect(
      deriveMediaFilename(
        'https://old.ghost.example/content/images/my%20photo%20(1).png',
      ),
    ).toBe('my-photo-1-.png')
  })

  it('handles Ghost placeholder URLs', () => {
    expect(
      deriveMediaFilename('__GHOST_URL__/content/images/2023/01/x.webp'),
    ).toBe('x.webp')
  })

  it('falls back to a default name when there is no basename', () => {
    expect(deriveMediaFilename('https://example.com/')).toBe('file')
  })
})

describe('rewriteMediaUrls', () => {
  const media = new Map<string, MediaRef>([
    [
      'https://old.ghost.example/content/images/2023/01/a.jpg',
      { id: '1', url: 'https://cdn.new.example/media/a.jpg' },
    ],
    [
      '__GHOST_URL__/content/images/2023/01/b.png',
      { id: '2', url: 'https://cdn.new.example/media/b.png' },
    ],
  ])

  it('returns an empty string for empty input', () => {
    expect(rewriteMediaUrls(null, media)).toBe('')
    expect(rewriteMediaUrls('', media)).toBe('')
  })

  it('replaces every occurrence of each mapped URL', () => {
    const html =
      '<img src="https://old.ghost.example/content/images/2023/01/a.jpg" />' +
      '<img src="__GHOST_URL__/content/images/2023/01/b.png" />' +
      '<a href="https://old.ghost.example/content/images/2023/01/a.jpg">x</a>'
    expect(rewriteMediaUrls(html, media)).toBe(
      '<img src="https://cdn.new.example/media/a.jpg" />' +
        '<img src="https://cdn.new.example/media/b.png" />' +
        '<a href="https://cdn.new.example/media/a.jpg">x</a>',
    )
  })

  it('leaves unmapped URLs untouched', () => {
    const html = '<img src="https://other.example/keep.jpg" />'
    expect(rewriteMediaUrls(html, media)).toBe(html)
  })

  it('replaces longer URLs before shorter prefixes', () => {
    const overlap = new Map<string, MediaRef>([
      ['https://x.example/a', { id: '1', url: 'NEW_A' }],
      ['https://x.example/a/b.jpg', { id: '2', url: 'NEW_AB' }],
    ])
    expect(
      rewriteMediaUrls('<img src="https://x.example/a/b.jpg" />', overlap),
    ).toBe('<img src="NEW_AB" />')
  })
})
