import { describe, expect, it } from 'vitest'

import { analyticsConfigured, resolveAnalyticsTag } from '@/lib/analytics/tag'

describe('resolveAnalyticsTag', () => {
  it('renders nothing when neither id is set', () => {
    expect(resolveAnalyticsTag({})).toBeNull()
  })

  it('renders the GA4 tag when only a measurement id is set', () => {
    expect(resolveAnalyticsTag({ NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ' })).toEqual({
      kind: 'ga4',
      id: 'G-ABC1234XYZ',
    })
  })

  it('renders the container when only a container id is set', () => {
    expect(resolveAnalyticsTag({ NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234' })).toEqual({
      kind: 'gtm',
      id: 'GTM-ABC1234',
    })
  })

  // The failure this ordering exists to prevent has no undo: a container
  // almost always fires GA4 itself, so loading the direct tag alongside it
  // sends every page_view to the same property twice, and GA4 cannot separate
  // doubled hits after the fact.
  it('prefers the container over the direct tag when both are set', () => {
    expect(
      resolveAnalyticsTag({
        NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234',
        NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ',
      }),
    ).toEqual({ kind: 'gtm', id: 'GTM-ABC1234' })
  })

  // The one switch that says "this is not the real site" governs search
  // engines and analytics together, so staging cannot quietly report into the
  // production property.
  it.each(['1', 'true', 'yes', 'TRUE'])(
    'renders nothing while NEXT_PUBLIC_NOINDEX is %s',
    (value) => {
      expect(
        resolveAnalyticsTag({
          NEXT_PUBLIC_NOINDEX: value,
          NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234',
          NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ',
        }),
      ).toBeNull()
    },
  )

  it('renders a tag once the noindex switch is off', () => {
    expect(
      resolveAnalyticsTag({
        NEXT_PUBLIC_NOINDEX: '0',
        NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234',
      }),
    ).toEqual({ kind: 'gtm', id: 'GTM-ABC1234' })
  })

  it('trims surrounding whitespace, which a copy-paste leaves behind', () => {
    expect(
      resolveAnalyticsTag({ NEXT_PUBLIC_GTM_ID: '  GTM-ABC1234  ' }),
    ).toEqual({ kind: 'gtm', id: 'GTM-ABC1234' })
  })

  it('treats a whitespace-only id as unset', () => {
    expect(
      resolveAnalyticsTag({
        NEXT_PUBLIC_GTM_ID: '   ',
        NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ',
      }),
    ).toEqual({ kind: 'ga4', id: 'G-ABC1234XYZ' })
  })

  // The id reaches a script URL and an inline script body, so a value carrying
  // a quote would break out of the string it sits in.
  it.each([
    ["'+alert(1)+'", 'a quote'],
    ['G-ABC1234XYZ', 'a measurement id in the container slot'],
    ['gtm-lowercase', 'the wrong case'],
    ['GTM_ABC1234', 'an underscore'],
    ['GTM-', 'no body'],
  ])('rejects a malformed container id: %s (%s)', (value) => {
    expect(resolveAnalyticsTag({ NEXT_PUBLIC_GTM_ID: value })).toBeNull()
  })

  it.each([
    ["'};alert(1);//", 'a quote'],
    ['GTM-ABC1234', 'a container id in the measurement slot'],
    ['UA-12345-1', 'a Universal Analytics id'],
    ['G-', 'no body'],
  ])('rejects a malformed measurement id: %s (%s)', (value) => {
    expect(resolveAnalyticsTag({ NEXT_PUBLIC_GA_ID: value })).toBeNull()
  })

  // Falling through to the other id would be worse than rendering nothing: a
  // typo in the container id would silently start double-counting the moment
  // somebody added the container's own GA4 tag.
  it('does not fall back to GA4 when the container id is malformed', () => {
    expect(
      resolveAnalyticsTag({
        NEXT_PUBLIC_GTM_ID: 'nonsense',
        NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ',
      }),
    ).toBeNull()
  })
})

describe('analyticsConfigured', () => {
  // The CSP is built in middleware and must permit what the page may load, so
  // it keys on configuration rather than on the noindex gate.
  it('is true while noindex hides the tag', () => {
    expect(
      analyticsConfigured({
        NEXT_PUBLIC_NOINDEX: '1',
        NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234',
      }),
    ).toBe(true)
  })

  it.each([
    [{ NEXT_PUBLIC_GA_ID: 'G-ABC1234XYZ' }, true],
    [{ NEXT_PUBLIC_GTM_ID: 'GTM-ABC1234' }, true],
    [{}, false],
    [{ NEXT_PUBLIC_GA_ID: '   ' }, false],
  ])('reads %o as %s', (env, expected) => {
    expect(analyticsConfigured(env)).toBe(expected)
  })
})
