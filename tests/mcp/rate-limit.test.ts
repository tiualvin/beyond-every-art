import { describe, expect, it } from 'vitest'

import { FixedWindowRateLimiter, rateLimitKey } from '../../lib/mcp/rate-limit'

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit and then refuses', () => {
    const limiter = new FixedWindowRateLimiter(3, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('a', 10).allowed).toBe(true)
    expect(limiter.check('a', 20).allowed).toBe(true)
    expect(limiter.check('a', 30)).toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it('starts a fresh window once the old one has passed', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('a', 999).allowed).toBe(false)
    expect(limiter.check('a', 1000).allowed).toBe(true)
  })

  it('counts each key separately', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('b', 0).allowed).toBe(true)
    expect(limiter.check('a', 0).allowed).toBe(false)
  })

  it('reports how many requests are left in the window', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000)

    expect(limiter.check('a', 0).remaining).toBe(1)
    expect(limiter.check('a', 1).remaining).toBe(0)
  })
})

describe('rateLimitKey', () => {
  // Keying on the credential rather than the source address is deliberate:
  // requests arrive from a vendor's cloud, whose addresses are shared.
  it('buckets by the tail of the bearer token, never the whole key', () => {
    const key = rateLimitKey('Bearer abcdefghijklmnop')

    expect(key).toBe('key:ijklmnop')
    expect(key).not.toContain('abcdefgh')
  })

  it('is case-insensitive about the scheme', () => {
    expect(rateLimitKey('bearer abcdefghijklmnop')).toBe('key:ijklmnop')
  })

  it('buckets credential-less callers together, protecting the key lookup', () => {
    expect(rateLimitKey(null)).toBe('anonymous')
    expect(rateLimitKey('Bearer   ')).toBe('anonymous')
  })
})
