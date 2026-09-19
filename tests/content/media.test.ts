import { describe, expect, it } from 'vitest'

import { toAltText, toMediaImage } from '../../lib/content/media'

describe('toAltText', () => {
  it('keeps real alternative text, trimmed', () => {
    expect(toAltText('  Lead white pigment ground on glass  ')).toBe(
      'Lead white pigment ground on glass',
    )
  })

  it('treats blank alt as decorative', () => {
    expect(toAltText('')).toBe('')
    expect(toAltText('   ')).toBe('')
    expect(toAltText(null)).toBe('')
    expect(toAltText(undefined)).toBe('')
  })

  it('treats alt that merely repeats the file name as decorative', () => {
    expect(toAltText('Studio-Shot.JPG', 'studio-shot.jpg')).toBe('')
  })

  it('treats a bare file name as decorative even without the file name to compare', () => {
    expect(toAltText('screenshot-2019-04-02.png')).toBe('')
    expect(toAltText('IMG_4821.jpeg')).toBe('')
    expect(toAltText('diagram.svg')).toBe('')
  })

  it('keeps a description that happens to mention a file name', () => {
    expect(toAltText('Detail of cracked varnish.jpg photographed raking')).toBe(
      'Detail of cracked varnish.jpg photographed raking',
    )
  })
})

describe('toMediaImage', () => {
  const record = {
    url: '/api/media/file/ultramarine.jpg',
    alt: 'Ground ultramarine in a glass jar',
    filename: 'ultramarine.jpg',
    caption: 'Natural ultramarine, ground by hand.',
    credit: 'Photograph: studio archive',
    width: 1600,
    height: 1067,
  }

  it('maps a populated upload relationship', () => {
    expect(toMediaImage(record)).toEqual({
      url: '/api/media/file/ultramarine.jpg',
      alt: 'Ground ultramarine in a glass jar',
      width: 1600,
      height: 1067,
      caption: 'Natural ultramarine, ground by hand.',
      credit: 'Photograph: studio archive',
      creditURL: null,
      cardUrl: null,
      ogUrl: null,
    })
  })

  // The credit line links only when the record says where to. Most do not,
  // and those render exactly as they did before the field existed.
  it('carries a credit link through, vetted', () => {
    expect(
      toMediaImage({ ...record, creditURL: 'https://unsplash.com/@shhiscat' })
        ?.creditURL,
    ).toBe('https://unsplash.com/@shhiscat')
  })

  it('drops a credit link that must never reach an href', () => {
    // Belt and braces with the collection's own validation: this is the check
    // that holds for a row written before that validation, or by a script
    // running with `overrideAccess`.
    expect(
      toMediaImage({ ...record, creditURL: 'javascript:alert(1)' })?.creditURL,
    ).toBeNull()
    expect(
      toMediaImage({ ...record, creditURL: 'http://unsplash.com/@x' })
        ?.creditURL,
    ).toBeNull()
  })

  // Media uploaded before a size was added to the collection has no derivative
  // for it, and the site has to keep rendering — so a missing size is null and
  // every caller falls back to the original rather than building a broken URL.
  it('reads generated sizes when they exist and nulls them when they do not', () => {
    const image = toMediaImage({
      ...record,
      sizes: {
        card: { url: '/api/media/file/ultramarine-768.jpg', width: 768 },
        og: {},
      },
    })

    expect(image?.cardUrl).toBe('/api/media/file/ultramarine-768.jpg')
    expect(image?.ogUrl).toBeNull()
    expect(toMediaImage({ ...record, sizes: null })?.cardUrl).toBeNull()
  })

  it('returns null when there is nothing to render', () => {
    expect(toMediaImage(null)).toBeNull()
    expect(toMediaImage(undefined)).toBeNull()
    // An unpopulated relationship is a bare ID, not a record.
    expect(toMediaImage(42)).toBeNull()
    expect(toMediaImage('68b1f0c2a1')).toBeNull()
    // A record whose file never resolved to a URL.
    expect(toMediaImage({ ...record, url: '   ' })).toBeNull()
    expect(toMediaImage({ alt: 'orphaned' })).toBeNull()
  })

  it('omits dimensions that cannot reserve space', () => {
    const image = toMediaImage({
      ...record,
      width: 0,
      height: Number.NaN,
    })
    expect(image?.width).toBeNull()
    expect(image?.height).toBeNull()
  })

  it('normalizes optional caption and credit to null', () => {
    const image = toMediaImage({ ...record, caption: '  ', credit: undefined })
    expect(image?.caption).toBeNull()
    expect(image?.credit).toBeNull()
  })

  it('carries the decorative-alt rule through from the record', () => {
    const image = toMediaImage({ ...record, alt: 'ultramarine.jpg' })
    expect(image?.alt).toBe('')
  })
})
