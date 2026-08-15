import { describe, expect, it } from 'vitest'

import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
  tooManyRequestsInit,
} from '../../lib/security/rate-limit'

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit and then refuses', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('a', 10).allowed).toBe(true)
    expect(limiter.check('a', 20)).toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it('starts a fresh window once the old one has passed', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('a', 500).allowed).toBe(false)
    expect(limiter.check('a', 1000).allowed).toBe(true)
  })

  it('counts each key separately', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('b', 0).allowed).toBe(true)
    expect(limiter.check('a', 0).allowed).toBe(false)
  })
})

describe('clientKey', () => {
  const headers = (values: Record<string, string>) => new Headers(values)

  it('uses the last X-Forwarded-For hop, which is the peer Caddy accepted', () => {
    // A client can put anything at the front of this header; only the entry
    // appended by our own proxy means anything.
    const key = clientKey(
      headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }),
      {},
    )

    expect(key).toBe('ip:203.0.113.7')
  })

  it('ignores a forged CF-Connecting-IP while the proxy is off', () => {
    const key = clientKey(
      headers({
        'cf-connecting-ip': '9.9.9.9',
        'x-forwarded-for': '203.0.113.7',
      }),
      {},
    )

    expect(key).toBe('ip:203.0.113.7')
  })

  it('trusts CF-Connecting-IP once TRUST_CLOUDFLARE_IP is set', () => {
    const key = clientKey(
      headers({
        'cf-connecting-ip': '198.51.100.4',
        'x-forwarded-for': '203.0.113.7',
      }),
      { TRUST_CLOUDFLARE_IP: '1' },
    )

    expect(key).toBe('ip:198.51.100.4')
  })

  it('buckets a request with no forwarding header rather than waving it through', () => {
    expect(clientKey(headers({}), {})).toBe('ip:unknown')
  })

  it('skips empty hops instead of keying on a blank string', () => {
    expect(clientKey(headers({ 'x-forwarded-for': '203.0.113.7, ' }), {})).toBe(
      'ip:203.0.113.7',
    )
  })
})

describe('configuredLimit', () => {
  it('uses the default when nothing is set', () => {
    expect(configuredLimit('LIMIT', 10, {})).toBe(10)
  })

  it('takes a positive integer override', () => {
    expect(configuredLimit('LIMIT', 10, { LIMIT: '250' })).toBe(250)
  })

  it.each([
    ['not a number', 'ten'],
    ['zero, which would block every request', '0'],
    ['a negative, which would do the same', '-5'],
    ['a fraction the window cannot express', '2.5'],
    ['an empty string', ''],
  ])('falls back to the default on %s', (_why, value) => {
    expect(configuredLimit('LIMIT', 10, { LIMIT: value })).toBe(10)
  })
})

describe('retryAfterSeconds', () => {
  it('rounds up to whole seconds', () => {
    expect(retryAfterSeconds(1500, 0)).toBe(2)
  })

  it('never advertises less than a second, even on an expired window', () => {
    expect(retryAfterSeconds(0, 5000)).toBe(1)
  })

  it('is carried on the 429 response', () => {
    const init = tooManyRequestsInit(Date.now() + 30_000)

    expect(init.status).toBe(429)
    expect(
      (init.headers as Record<string, string>)['Retry-After'],
    ).toBeDefined()
  })
})
