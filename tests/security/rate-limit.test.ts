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

  it('releases a key once its window has passed, without a sweep first', () => {
    // Expiry must not depend on the periodic sweep: the sweep only reclaims
    // memory, and a key whose window has passed is free again immediately.
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('a', 1001).allowed).toBe(true)
  })
})

describe('FixedWindowRateLimiter memory ceiling', () => {
  // The MCP limiter buckets on the credential the caller presents, so the key
  // space belongs to the attacker: without a ceiling, a run of guessed keys is
  // a window per guess, held for the length of the window.
  it('stops opening new windows once the ceiling is reached', () => {
    const limiter = new FixedWindowRateLimiter(5, 1000, 3)

    for (let index = 0; index < 100; index += 1) {
      limiter.check(`key-${index}`, 0)
    }

    expect(limiter.size).toBeLessThanOrEqual(4) // three keys plus overflow
  })

  it('counts overflow keys together rather than waving them through', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000, 1)

    // The first key gets the only real bucket; everything after it shares one.
    expect(limiter.check('first', 0).allowed).toBe(true)
    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.check('b', 0).allowed).toBe(true)
    expect(limiter.check('c', 0).allowed).toBe(false)
    expect(limiter.check('d', 0).allowed).toBe(false)
    // The key that got in first is unaffected by the flood behind it.
    expect(limiter.check('first', 0).allowed).toBe(true)
  })

  it('reuses the ceiling for fresh keys once old windows have passed', () => {
    const limiter = new FixedWindowRateLimiter(5, 1000, 2)

    limiter.check('a', 0)
    limiter.check('b', 0)
    // Full at t=0; by t=2000 both windows are finished and can be reclaimed.
    limiter.check('c', 2000)

    expect(limiter.check('c', 2000).remaining).toBe(3)
  })
})

describe('FixedWindowRateLimiter.peek', () => {
  it('reports the verdict without spending anything', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    expect(limiter.peek('a', 0).allowed).toBe(true)
    expect(limiter.peek('a', 0).allowed).toBe(true)
    // Still unspent, so the one real request is still available.
    expect(limiter.check('a', 0).allowed).toBe(true)
    expect(limiter.peek('a', 0).allowed).toBe(false)
  })

  it('sees a window that check() opened', () => {
    const limiter = new FixedWindowRateLimiter(2, 1000)

    limiter.check('a', 0)
    expect(limiter.peek('a', 0)).toMatchObject({ allowed: true, remaining: 1 })
    limiter.check('a', 0)
    expect(limiter.peek('a', 0)).toMatchObject({ allowed: false, remaining: 0 })
  })

  it('treats an expired window as a fresh one', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000)

    limiter.check('a', 0)
    expect(limiter.peek('a', 1000).allowed).toBe(true)
  })

  it('reads the overflow bucket once the ceiling is reached', () => {
    // The case that made a peek-gated limiter stop gating. `check` diverts a
    // key it has no room for into the shared bucket; `peek` used to look the
    // raw key up, find nothing, and answer "allowed" — so past the ceiling
    // every new key was waved through no matter how much the flood had spent.
    const limiter = new FixedWindowRateLimiter(2, 1000, 1)

    // One real bucket, taken. Everything after this shares the overflow one.
    limiter.check('first', 0)
    limiter.check('a', 0)
    limiter.check('b', 0)

    // 'c' has never been seen and there is no room for it, so it lands in the
    // overflow bucket — which the two spends above have already exhausted.
    expect(limiter.check('c', 0).allowed).toBe(false)
    expect(limiter.peek('c', 0).allowed).toBe(false)
  })

  it('still answers for the key that holds its own window', () => {
    // The other half: overflow must not swallow a key that got in early.
    const limiter = new FixedWindowRateLimiter(2, 1000, 1)

    limiter.check('first', 0)
    limiter.check('flood', 0)
    limiter.check('flood', 0)

    // 'flood' exhausted the shared bucket; 'first' has its own and is untouched.
    expect(limiter.peek('flood', 0).allowed).toBe(false)
    expect(limiter.peek('first', 0)).toMatchObject({
      allowed: true,
      remaining: 1,
    })
  })

  it('agrees with check() for a fresh key while there is still room', () => {
    // Below the ceiling nothing changes: an unseen key is allowed and no
    // window is opened for it by asking.
    const limiter = new FixedWindowRateLimiter(2, 1000, 10)

    expect(limiter.peek('unseen', 0).allowed).toBe(true)
    expect(limiter.size).toBe(0)
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
