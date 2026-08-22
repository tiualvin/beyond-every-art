import { NextResponse } from 'next/server'

import {
  issuerOrigin,
  MAX_OAUTH_BODY_BYTES,
  oauthEnabled,
} from '@/lib/oauth/config'
import { revokeByToken } from '@/lib/oauth/grants'
import { getPayloadClient } from '@/lib/payload'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
} from '@/lib/security/rate-limit'
import { readBoundedText } from '@/lib/security/request-body'

// RFC 7009 revocation.
//
// Answers 200 whether or not the token existed, which the RFC requires in §2.2:
// a revocation endpoint that distinguished them would be an oracle for testing
// whether a stolen token is still live.
//
// Revoking either token kills the whole grant — see `revokeByToken` for why
// that is the less surprising reading of the request.
export const dynamic = 'force-dynamic'

/**
 * Bounded for the same reason `/oauth/token` is, and it was the one endpoint in
 * this layer that was not.
 *
 * Revocation has to answer without a credential — RFC 7009 §2.2 requires the
 * uniform 200 so the endpoint cannot be used to test whether a stolen token is
 * still live — so "unauthenticated" is the design rather than an oversight. But
 * every call that carries a token reaches `revokeByToken`, which is a database
 * lookup, and an endpoint that answers everyone identically is exactly the one
 * that needs a volume bound rather than an identity check.
 *
 * Sixty a minute is far above a client tidying up after itself.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_OAUTH_REVOKE_PER_MINUTE', 60),
  60_000,
)

export async function POST(request: Request): Promise<NextResponse> {
  if (!oauthEnabled() || !issuerOrigin()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const limit = limiter.check(clientKey(request.headers))
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'temporarily_unavailable',
        error_description: `Too many revocation requests from this address. Try again in ${retryAfterSeconds(limit.resetAt)} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfterSeconds(limit.resetAt)),
        },
      },
    )
  }

  let token: string | null = null
  try {
    // Read once, bounded, then parsed by content type. `request.json()` and
    // `request.text()` would each let the caller decide how much is buffered.
    const body = await readBoundedText(request, MAX_OAUTH_BODY_BYTES)
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const parsed = JSON.parse(body) as { token?: unknown }
      token = typeof parsed.token === 'string' ? parsed.token : null
    } else {
      token = new URLSearchParams(body).get('token')
    }
  } catch {
    token = null
  }

  if (token) {
    const payload = await getPayloadClient()
    await revokeByToken(payload, token)
  }

  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
