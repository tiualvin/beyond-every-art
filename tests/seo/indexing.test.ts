import { describe, expect, it } from 'vitest'

import { isAuthorized, isNoindex, parseBasicAuth } from '../../lib/seo/indexing'

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
})
