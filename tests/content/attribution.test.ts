import { describe, expect, it } from 'vitest'

import {
  attributionHref,
  toCreditURL,
  withoutTrackingParams,
} from '../../lib/content/attribution'

describe('toCreditURL', () => {
  it('accepts a plain https address', () => {
    expect(toCreditURL('https://unsplash.com/@shhiscat')).toBe(
      'https://unsplash.com/@shhiscat',
    )
  })

  it('refuses the schemes that make an href dangerous', () => {
    // React renders an href verbatim. In production it does not even warn.
    expect(toCreditURL('javascript:alert(1)')).toBeNull()
    expect(toCreditURL('JaVaScRiPt:alert(1)')).toBeNull()
    expect(toCreditURL('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(toCreditURL('vbscript:msgbox(1)')).toBeNull()
  })

  it('refuses plaintext and relative addresses', () => {
    expect(toCreditURL('http://unsplash.com/@x')).toBeNull()
    expect(toCreditURL('//unsplash.com/@x')).toBeNull()
    expect(toCreditURL('/about')).toBeNull()
    expect(toCreditURL('unsplash.com/@x')).toBeNull()
  })

  it('treats blank and non-string values as absent', () => {
    expect(toCreditURL('')).toBeNull()
    expect(toCreditURL('   ')).toBeNull()
    expect(toCreditURL(null)).toBeNull()
    expect(toCreditURL(undefined)).toBeNull()
    expect(toCreditURL(42)).toBeNull()
    expect(toCreditURL({ href: 'https://x.test' })).toBeNull()
  })

  it('trims, because a text field collects whitespace', () => {
    expect(toCreditURL('  https://unsplash.com/@x  ')).toBe(
      'https://unsplash.com/@x',
    )
  })
})

describe('attributionHref', () => {
  it('adds the referral parameters Unsplash asks for', () => {
    const href = attributionHref('https://unsplash.com/@shhiscat')
    const url = new URL(href!)
    expect(url.searchParams.get('utm_source')).toBe('beyond_every_art')
    expect(url.searchParams.get('utm_medium')).toBe('referral')
  })

  // The whole point of folding the check in here: there is no argument that
  // produces a usable href without passing it.
  it('is null for anything that must not become an href', () => {
    expect(attributionHref('javascript:alert(1)')).toBeNull()
    expect(
      attributionHref('data:text/html,<script>alert(1)</script>'),
    ).toBeNull()
    expect(attributionHref('http://unsplash.com/@x')).toBeNull()
    expect(attributionHref('not a url')).toBeNull()
    expect(attributionHref('')).toBeNull()
    expect(attributionHref(null)).toBeNull()
    expect(attributionHref(undefined)).toBeNull()
  })

  it('covers the www host too, since a stored URL may carry it', () => {
    expect(attributionHref('https://www.unsplash.com/@x')).toContain(
      'utm_source=beyond_every_art',
    )
  })

  it('replaces parameters rather than appending a second copy', () => {
    const href = attributionHref(
      'https://unsplash.com/@x?utm_source=ghost&utm_medium=referral',
    )
    expect(href!.match(/utm_source=/g)).toHaveLength(1)
    expect(href).toContain('utm_source=beyond_every_art')
    expect(href).not.toContain('ghost')
  })

  it('leaves every other host alone', () => {
    // A museum or a photographer's own site never asked to be tagged.
    for (const url of [
      'https://www.metmuseum.org/art/collection/search/1',
      'https://example.photographer.test/portfolio',
      'https://unsplash.com.evil.test/@x',
    ]) {
      expect(attributionHref(url)).toBe(url)
    }
  })

  it('does not throw on a value that cannot be parsed', () => {
    // This runs during render; a bad credit URL is not a reason to fail a
    // page, so it degrades to a plain-text credit rather than an exception.
    expect(() => attributionHref('not a url')).not.toThrow()
  })
})

describe('withoutTrackingParams', () => {
  it('removes the parameters Ghost wrote and nothing else', () => {
    expect(
      withoutTrackingParams(
        'https://unsplash.com/@x?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit',
      ),
    ).toBe('https://unsplash.com/@x')
  })

  it('keeps a query that means something', () => {
    expect(
      withoutTrackingParams('https://m.test/art?objectId=42&utm_source=ghost'),
    ).toBe('https://m.test/art?objectId=42')
  })

  it('matches utm keys case-insensitively', () => {
    expect(withoutTrackingParams('https://x.test/a?UTM_Source=ghost')).toBe(
      'https://x.test/a',
    )
  })

  it('leaves a URL with no query alone', () => {
    expect(withoutTrackingParams('https://x.test/a')).toBe('https://x.test/a')
  })
})
