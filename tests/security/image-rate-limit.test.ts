// The bound on `/_next/image`, which was the last public endpoint without one.
//
// Three things are pinned here, and only the first is the obvious one. The
// first is that the limiter bites at all. The second is that a throttled image
// request is answered *by the limiter* rather than falling through the rest of
// the middleware — the staging Basic Auth gate and the redirect-map fetch both
// sit below this branch, and `_next/image` has never passed through either.
// Routing it through them now would put a credential prompt in front of every
// image on a staging deploy and a redirect lookup in front of every image
// everywhere.
//
// The third is the spelling of the path, which is the one that decides whether
// any of this runs in production at all. `trailingSlash` is on, so Next emits an
// internal redirect from `/:notfile` to `/:notfile/` and does not exempt
// `_next`: a real image request is answered 308 at `/_next/image` by the
// redirect stage — which runs before middleware — and arrives back at
// `/_next/image/`, which is where the optimizer actually answers. Checked
// against a running production build: with the limit set to 3, ten requests to
// `/_next/image` were ten 308s that middleware never saw, and ten to
// `/_next/image/` were served without a single 429. So the slashed form is the
// one that carries every real request, and it leads here.

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IMAGE_QUERY = '?url=%2Fapi%2Fmedia%2Ffile%2Fa.jpg&w=640&q=75'

/**
 * The path production serves the optimizer on.
 *
 * The slashless spelling is tested too, because it is the one every caller asks
 * for and the one a matcher entry names — but it is the redirect's problem, not
 * this branch's, and nothing may depend on it being the only form handled.
 */
const SERVED_PATH = '/_next/image/'

/** A fresh module graph, so the limiter reads the stubbed env at import. */
async function loadMiddleware() {
  vi.resetModules()
  return (await import('../../middleware')).middleware
}

/** A `NextRequest`, because the handler reads `nextUrl` rather than `url`. */
function imageRequest(ip: string, path: string = SERVED_PATH): NextRequest {
  return new NextRequest(
    `https://www.beyondeveryart.com${path}${IMAGE_QUERY}`,
    { headers: { 'x-forwarded-for': ip } },
  )
}

describe('the /_next/image limiter', () => {
  beforeEach(() => {
    vi.stubEnv('RATE_LIMIT_IMAGE_PER_MINUTE', '3')
    // Set so that a fall-through would be visibly different: with this on, any
    // request reaching the gate below the image branch is answered 401.
    vi.stubEnv('STAGING_BASIC_AUTH', 'staff:secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('passes requests inside the allowance through', async () => {
    const middleware = await loadMiddleware()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await middleware(imageRequest('198.51.100.7'))
      // 200 and not 401: proof the branch returned before the Basic Auth gate,
      // which is stubbed on above and would otherwise answer every one of these.
      expect(response.status).toBe(200)
    }
  })

  it('answers 429 once the allowance is spent', async () => {
    const middleware = await loadMiddleware()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await middleware(imageRequest('198.51.100.8'))
    }

    const response = await middleware(imageRequest('198.51.100.8'))
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('counts each source address separately', async () => {
    const middleware = await loadMiddleware()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await middleware(imageRequest('198.51.100.9'))
    }

    // A reader behind a different address is untouched by a neighbour's flood.
    const response = await middleware(imageRequest('198.51.100.10'))
    expect(response.status).toBe(200)
  })

  it('limits the slashless spelling on the same allowance', async () => {
    // Both spellings reach this branch, and they share one bucket: alternating
    // between them must not buy a second allowance. The slashless form is a 308
    // in production rather than a request middleware sees, but nothing in the
    // handler should depend on that — the redirect is the redirect stage's to
    // emit, and `skipMiddlewareUrlNormalize` or a `trailingSlash` change would
    // hand this branch the raw path without warning.
    const middleware = await loadMiddleware()

    for (const path of ['/_next/image', '/_next/image/', '/_next/image']) {
      const response = await middleware(imageRequest('198.51.100.11', path))
      expect(response.status).toBe(200)
    }

    const response = await middleware(
      imageRequest('198.51.100.11', '/_next/image'),
    )
    expect(response.status).toBe(429)
  })

  it('is declared in the matcher, or none of the above ever runs', async () => {
    // The handler is only reached for paths the matcher selects, and
    // `_next/image` is excluded by the first entry on purpose. Without the
    // explicit entry these tests would keep passing while the limiter was never
    // invoked in production.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(import.meta.dirname, '../../middleware.ts'),
      'utf8',
    )
    const matcher = /matcher:\s*\[([\s\S]*?)\n  \]/.exec(source)?.[1] ?? ''

    expect(matcher).toContain("'/_next/image'")
  })
})
