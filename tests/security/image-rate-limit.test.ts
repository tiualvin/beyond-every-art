// The bound on `/_next/image`, which was the last public endpoint without one.
//
// Two things are pinned here, and the second is the one a refactor breaks
// quietly. The first is that the limiter bites at all. The second is that a
// throttled image request is answered *by the limiter* rather than falling
// through the rest of the middleware — the staging Basic Auth gate and the
// redirect-map fetch both sit below this branch, and `_next/image` has never
// passed through either. Routing it through them now would put a credential
// prompt in front of every image on a staging deploy and a redirect lookup in
// front of every image everywhere.

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IMAGE_URL =
  'https://www.beyondeveryart.com/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Fa.jpg&w=640&q=75'

/** A fresh module graph, so the limiter reads the stubbed env at import. */
async function loadMiddleware() {
  vi.resetModules()
  return (await import('../../middleware')).middleware
}

/** A `NextRequest`, because the handler reads `nextUrl` rather than `url`. */
function imageRequest(ip: string): NextRequest {
  return new NextRequest(IMAGE_URL, { headers: { 'x-forwarded-for': ip } })
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
