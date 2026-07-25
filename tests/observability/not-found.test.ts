import { describe, expect, it } from 'vitest'

import {
  buildNotFoundEntry,
  isNotableNotFound,
} from '../../lib/observability/not-found'

describe('isNotableNotFound', () => {
  it('records page-like paths that a reader could have followed', () => {
    expect(isNotableNotFound('/understanding-ultramarine')).toBe(true)
    expect(isNotableNotFound('/tag/color')).toBe(true)
    expect(isNotableNotFound('/2023/01/an-old-ghost-permalink/')).toBe(true)
    expect(isNotableNotFound('/search?q=ultramarine')).toBe(true)
  })

  it('ignores asset probes and script scans', () => {
    expect(isNotableNotFound('/logo.png')).toBe(false)
    expect(isNotableNotFound('/content/images/2023/01/feature.jpg')).toBe(false)
    expect(isNotableNotFound('/main.js.map')).toBe(false)
    expect(isNotableNotFound('/xmlrpc.php')).toBe(false)
    expect(isNotableNotFound('/_next/static/chunk')).toBe(false)
    expect(isNotableNotFound('/wp-admin/setup-config')).toBe(false)
    expect(isNotableNotFound('/.well-known/traffic-advice')).toBe(false)
  })

  it('ignores the home page, non-paths, and absurdly long URLs', () => {
    expect(isNotableNotFound('/')).toBe(false)
    expect(isNotableNotFound('')).toBe(false)
    expect(isNotableNotFound(null)).toBe(false)
    expect(isNotableNotFound(undefined)).toBe(false)
    expect(isNotableNotFound('https://example.com/post')).toBe(false)
    expect(isNotableNotFound(`/${'a'.repeat(600)}`)).toBe(false)
  })

  it('keeps a query string from hiding an asset probe', () => {
    expect(isNotableNotFound('/logo.png?v=2')).toBe(false)
  })
})

describe('buildNotFoundEntry', () => {
  it('builds a single structured entry with the referrer when present', () => {
    expect(
      buildNotFoundEntry({
        path: '/understanding-ultramarine',
        referrer: 'https://old.ghost.example/',
        now: new Date('2026-01-02T03:04:05.000Z'),
      }),
    ).toEqual({
      level: 'warn',
      event: 'not_found',
      time: '2026-01-02T03:04:05.000Z',
      path: '/understanding-ultramarine',
      referrer: 'https://old.ghost.example/',
    })
  })

  it('reports a missing referrer as null', () => {
    expect(
      buildNotFoundEntry({ path: '/missing', now: new Date(0) })?.referrer,
    ).toBeNull()
  })

  it('truncates over-long referrers instead of dropping the event', () => {
    const entry = buildNotFoundEntry({
      path: '/missing',
      referrer: `https://example.com/${'a'.repeat(900)}`,
    })
    expect(entry?.path).toBe('/missing')
    expect(entry?.referrer?.length).toBe(513)
  })

  it('returns nothing for filtered paths', () => {
    expect(buildNotFoundEntry({ path: '/favicon.ico' })).toBeNull()
    expect(buildNotFoundEntry({ path: '/' })).toBeNull()
  })
})
