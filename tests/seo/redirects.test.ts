import { describe, expect, it } from 'vitest'

import {
  buildRedirectMap,
  matchRedirect,
  normalizePath,
  type RedirectRecord,
} from '../../lib/seo/redirects'

describe('normalizePath', () => {
  it('strips trailing slashes except for the root', () => {
    expect(normalizePath('/about/')).toBe('/about')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath('')).toBe('/')
  })

  it('adds a leading slash and collapses duplicate slashes', () => {
    expect(normalizePath('about')).toBe('/about')
    expect(normalizePath('/blog//post///')).toBe('/blog/post')
  })

  it('drops query strings and fragments', () => {
    expect(normalizePath('/post/?utm=x')).toBe('/post')
    expect(normalizePath('/post#section')).toBe('/post')
  })

  it('decodes percent-encoded paths', () => {
    expect(normalizePath('/caf%C3%A9/')).toBe('/café')
  })
})

describe('buildRedirectMap', () => {
  const records: RedirectRecord[] = [
    { source: '/old-post/', destination: '/new-post/', statusCode: '301' },
    { source: '/temp', destination: '/elsewhere', statusCode: 302 },
    { source: '/disabled/', destination: '/nope', enabled: false },
    { source: '', destination: '/missing-source' },
    { source: '/no-dest', destination: '' },
  ]

  it('keys on the normalized source and coerces the status', () => {
    const map = buildRedirectMap(records)
    expect(map.get('/old-post')).toEqual({
      destination: '/new-post/',
      statusCode: 301,
    })
    expect(map.get('/temp')).toEqual({
      destination: '/elsewhere',
      statusCode: 302,
    })
  })

  it('skips disabled rows and rows missing a source or destination', () => {
    const map = buildRedirectMap(records)
    expect(map.has('/disabled')).toBe(false)
    expect(map.has('/no-dest')).toBe(false)
    expect(
      [...map.values()].some((r) => r.destination === '/missing-source'),
    ).toBe(false)
  })

  it('defaults an invalid status code to 301', () => {
    const map = buildRedirectMap([
      { source: '/x', destination: '/y', statusCode: 418 },
    ])
    expect(map.get('/x')?.statusCode).toBe(301)
  })
})

describe('matchRedirect', () => {
  const map = buildRedirectMap([
    { source: '/old-post/', destination: '/new-post/', statusCode: '301' },
  ])

  it('matches regardless of the incoming trailing slash', () => {
    expect(matchRedirect(map, '/old-post')?.destination).toBe('/new-post/')
    expect(matchRedirect(map, '/old-post/')?.destination).toBe('/new-post/')
    expect(matchRedirect(map, '/old-post/?ref=1')?.destination).toBe(
      '/new-post/',
    )
  })

  it('returns null when there is no matching rule', () => {
    expect(matchRedirect(map, '/unknown')).toBeNull()
  })
})
