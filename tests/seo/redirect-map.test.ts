// The redirect map is the one dependency in front of every page-like request,
// so what it does when it is slow or unavailable decides whether the site
// degrades or stops. These cover the three behaviours that make the difference;
// none of them is visible from a passing page render, which is why they are
// pinned here rather than left to be noticed during an incident.

import { describe, expect, it, vi } from 'vitest'

import { RedirectMapCache } from '../../lib/seo/redirect-map'
import type { RedirectRecord } from '../../lib/seo/redirects'

const ORIGIN = 'http://127.0.0.1:3000'

const RULES: RedirectRecord[] = [
  {
    source: '/old-post',
    destination: '/new-post',
    statusCode: '301',
    enabled: true,
  },
]

function ok(redirects: RedirectRecord[] = RULES): Response {
  return new Response(JSON.stringify({ redirects }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fetch that never settles, which is the case a `catch` cannot see. */
const hangs: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new Error('The operation was aborted due to timeout')),
    )
  })

describe('RedirectMapCache', () => {
  it('serves the fetched rules', async () => {
    const cache = new RedirectMapCache({ fetchImpl: async () => ok() })
    const map = await cache.load(ORIGIN)

    expect(map.get('/old-post')?.destination).toBe('/new-post')
  })

  it('fetches once and serves the rest of the window from memory', async () => {
    const fetchImpl = vi.fn(async () => ok())
    const cache = new RedirectMapCache({ fetchImpl })

    await cache.load(ORIGIN)
    await cache.load(ORIGIN)
    await cache.load(ORIGIN)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('shares one refresh between requests that arrive together', async () => {
    // Without this, the cache expiring under load meant every request in the
    // same instant issued its own fetch — the site doubling its own request
    // volume once a minute, at the moments it was busiest.
    let release: (value: Response) => void = () => {}
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    )
    const cache = new RedirectMapCache({ fetchImpl })

    const waiting = Promise.all([
      cache.load(ORIGIN),
      cache.load(ORIGIN),
      cache.load(ORIGIN),
    ])
    release(ok())
    const maps = await waiting

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(maps.every((map) => map.has('/old-post'))).toBe(true)
  })

  it('gives up on a fetch that never settles', async () => {
    // The whole point of the deadline: a rejected fetch was always handled, but
    // a hung one is not a rejection, and it held every page behind it.
    const cache = new RedirectMapCache({ fetchImpl: hangs, timeoutMs: 20 })

    await expect(cache.load(ORIGIN)).rejects.toThrow()
  })

  it('serves the last good copy when a refresh fails', async () => {
    // One failed refresh used to turn every migrated Ghost URL into a 404 until
    // an attempt happened to succeed.
    let attempt = 0
    const cache = new RedirectMapCache({
      ttlMs: 0,
      fetchImpl: async () => {
        attempt += 1
        if (attempt === 1) return ok()
        throw new Error('redirects-map responded 503')
      },
    })

    await cache.load(ORIGIN)
    const map = await cache.load(ORIGIN)

    expect(map.get('/old-post')?.destination).toBe('/new-post')
  })

  it('reports a failed refresh once, not once per waiting request', async () => {
    const onFailure = vi.fn()
    const cache = new RedirectMapCache({
      onFailure,
      fetchImpl: async () => {
        throw new Error('connection refused')
      },
    })

    await Promise.allSettled([cache.load(ORIGIN), cache.load(ORIGIN)])

    // Both callers wait on the same refresh, so the log line is emitted for the
    // fetch rather than for each request that happened to be waiting on it.
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), false)
  })

  it('distinguishes a stale answer from having nothing to answer with', async () => {
    // The two are different operator situations: one is a warning, the other is
    // redirects being off.
    const onFailure = vi.fn()
    let attempt = 0
    const cache = new RedirectMapCache({
      onFailure,
      ttlMs: 0,
      fetchImpl: async () => {
        attempt += 1
        if (attempt === 1) return ok()
        throw new Error('redirects-map responded 503')
      },
    })

    await cache.load(ORIGIN)
    await cache.load(ORIGIN)

    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), true)
  })

  it('rejects a non-200 rather than caching an empty table', async () => {
    // An empty map is indistinguishable from "no redirects configured", and
    // caching one would silently switch every migrated URL off for a minute.
    const cache = new RedirectMapCache({
      fetchImpl: async () => new Response('nope', { status: 502 }),
    })

    await expect(cache.load(ORIGIN)).rejects.toThrow('502')
  })
})
