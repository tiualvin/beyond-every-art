import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  constantTimeEquals,
  isAuthorized,
  isNoindex,
  parseBasicAuth,
  robotsDirective,
} from '../../lib/seo/indexing'

describe('isNoindex', () => {
  it('is true for truthy flag values', () => {
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: '1' })).toBe(true)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: 'true' })).toBe(true)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: 'YES' })).toBe(true)
  })

  it('is false when unset or falsey', () => {
    expect(isNoindex({})).toBe(false)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: '0' })).toBe(false)
    expect(isNoindex({ NEXT_PUBLIC_NOINDEX: 'false' })).toBe(false)
  })
})

describe('parseBasicAuth', () => {
  it('splits on the first colon so passwords may contain colons', () => {
    expect(parseBasicAuth({ STAGING_BASIC_AUTH: 'admin:pa:ss' })).toEqual({
      user: 'admin',
      password: 'pa:ss',
    })
  })

  it('returns null when unset or malformed', () => {
    expect(parseBasicAuth({})).toBeNull()
    expect(parseBasicAuth({ STAGING_BASIC_AUTH: 'nopassword' })).toBeNull()
    expect(parseBasicAuth({ STAGING_BASIC_AUTH: ':nouser' })).toBeNull()
  })
})

describe('constantTimeEquals', () => {
  it('agrees with === on what is equal', () => {
    expect(constantTimeEquals('', '')).toBe(true)
    expect(constantTimeEquals('s3cret', 's3cret')).toBe(true)
    expect(constantTimeEquals('s3cret', 's3crev')).toBe(false)
    expect(constantTimeEquals('s3cret', 'S3CRET')).toBe(false)
  })

  it('handles different lengths without reporting a prefix as a match', () => {
    expect(constantTimeEquals('s3cret', 's3cretx')).toBe(false)
    expect(constantTimeEquals('s3cretx', 's3cret')).toBe(false)
    expect(constantTimeEquals('', 's3cret')).toBe(false)
  })

  it('does not fold a NUL to the end of the shorter string', () => {
    // `charCodeAt` past the end gives NaN, coerced to 0. A literal NUL is also
    // 0, so a naive implementation would call these two equal.
    expect(constantTimeEquals('a', 'a\u0000')).toBe(false)
  })
})

describe('isAuthorized', () => {
  const creds = { user: 'admin', password: 's3cret' }
  const header = `Basic ${Buffer.from('admin:s3cret').toString('base64')}`

  it('accepts a matching Basic header', () => {
    expect(isAuthorized(header, creds)).toBe(true)
  })

  it('rejects wrong credentials, missing, or non-Basic headers', () => {
    expect(
      isAuthorized(
        `Basic ${Buffer.from('admin:wrong').toString('base64')}`,
        creds,
      ),
    ).toBe(false)
    expect(isAuthorized(null, creds)).toBe(false)
    expect(isAuthorized('Bearer token', creds)).toBe(false)
    expect(isAuthorized('Basic !!!not-base64', creds)).toBe(false)
  })

  it('rejects a wrong username, a wrong password, and a prefix of either', () => {
    const basic = (value: string) =>
      `Basic ${Buffer.from(value).toString('base64')}`

    expect(isAuthorized(basic('adminx:s3cret'), creds)).toBe(false)
    expect(isAuthorized(basic('admi:s3cret'), creds)).toBe(false)
    expect(isAuthorized(basic('admin:s3cretx'), creds)).toBe(false)
    expect(isAuthorized(basic('admin:s3cre'), creds)).toBe(false)
    expect(isAuthorized(basic('admin:'), creds)).toBe(false)
  })

  it('still splits on the first colon so passwords may contain one', () => {
    expect(
      isAuthorized(`Basic ${Buffer.from('admin:pa:ss').toString('base64')}`, {
        user: 'admin',
        password: 'pa:ss',
      }),
    ).toBe(true)
  })
})

describe('robotsDirective', () => {
  const live = {}

  it('permits large image previews for an ordinary document on a live deployment', () => {
    const indexable = { 'max-image-preview': 'large' }
    expect(robotsDirective(false, live)).toEqual(indexable)
    expect(robotsDirective(null, live)).toEqual(indexable)
    expect(robotsDirective(undefined, live)).toEqual(indexable)
  })

  it('never announces index, which would outrank the staging switch', () => {
    for (const noindex of [false, true, null, undefined]) {
      expect(robotsDirective(noindex, live)).not.toHaveProperty('index', true)
    }
  })

  it('hides a document that asked to be hidden, but keeps its links followed', () => {
    expect(robotsDirective(true, live)).toEqual({ index: false, follow: true })
  })

  it('hides everything on a noindexed deployment, links included', () => {
    const staging = { NEXT_PUBLIC_NOINDEX: '1' }
    expect(robotsDirective(false, staging)).toEqual({
      index: false,
      follow: false,
    })
    expect(robotsDirective(true, staging)).toEqual({
      index: false,
      follow: false,
    })
  })
})

describe('pages that set robots', () => {
  // Next's metadata merge replaces the layout's `robots` with the page's, and a
  // page's `robots: undefined` counts: the key is there, so the layout's
  // staging noindex and large-preview permission are both dropped. The search
  // page shipped exactly that. Routing every page through `robotsDirective`,
  // which never returns undefined, is the whole fix — so this checks the
  // routing rather than trusting it.
  const frontend = resolve(import.meta.dirname, '../../app/(frontend)')

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return walk(path)
      return /\.tsx?$/.test(entry.name) ? [path] : []
    })
  }

  const setters = walk(frontend)
    .map((path) => ({
      name: relative(frontend, path),
      text: readFileSync(path, 'utf8'),
    }))
    .filter(({ text }) => /^\s*robots:/m.test(text))

  it('finds the pages that do', () => {
    // The layout, the post-and-page route, and search. A guard that matched
    // nothing would pass forever.
    expect(setters.length).toBeGreaterThanOrEqual(3)
  })

  it.each(setters)('$name sets it through robotsDirective', ({ text }) => {
    const lines = text.match(/^\s*robots:.*$/gm) ?? []
    for (const line of lines) {
      expect(line).toMatch(/robots:\s*robotsDirective\(/)
    }
  })
})
