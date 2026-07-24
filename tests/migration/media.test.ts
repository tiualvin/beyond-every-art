import { describe, expect, it } from 'vitest'

import {
  collectMediaUrls,
  extractMediaUrlsFromHtml,
} from '../../lib/migration/media'

describe('extractMediaUrlsFromHtml', () => {
  it('returns an empty array for empty input', () => {
    expect(extractMediaUrlsFromHtml(null)).toEqual([])
    expect(extractMediaUrlsFromHtml('')).toEqual([])
  })

  it('finds img src and anchor href media references', () => {
    const html =
      '<img src="https://cdn.example/a.jpg" /><a href="https://cdn.example/b.pdf">doc</a>'
    expect(extractMediaUrlsFromHtml(html)).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/b.pdf',
    ])
  })

  it('resolves Ghost __GHOST_URL__ placeholders', () => {
    const html = '<img src="__GHOST_URL__/content/images/2023/01/x.webp?v=1" />'
    expect(extractMediaUrlsFromHtml(html)).toEqual([
      '__GHOST_URL__/content/images/2023/01/x.webp?v=1',
    ])
  })

  it('ignores non-media links', () => {
    expect(
      extractMediaUrlsFromHtml('<a href="https://example.com/about">about</a>'),
    ).toEqual([])
  })
})

describe('collectMediaUrls', () => {
  it('merges html references with explicit image fields and dedupes', () => {
    const urls = collectMediaUrls(
      '<img src="https://cdn.example/a.jpg" />',
      'https://cdn.example/feature.png',
      'https://cdn.example/a.jpg',
      null,
    )
    expect(urls).toEqual([
      'https://cdn.example/a.jpg',
      'https://cdn.example/feature.png',
    ])
  })
})
