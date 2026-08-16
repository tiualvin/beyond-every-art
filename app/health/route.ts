import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  tooManyRequests,
} from '@/lib/security/rate-limit'

// Liveness + database readiness probe for the reverse proxy, container
// healthcheck, and external uptime monitoring. Always dynamic so it reflects
// the current database state rather than a cached response.
export const dynamic = 'force-dynamic'

/**
 * Generous for every prober that legitimately calls this, tight enough that it
 * is not a way to buy database work.
 *
 * This endpoint is reachable without credentials — deliberately, since a probe
 * cannot authenticate, and `middleware.ts` exempts it from the staging Basic
 * Auth gate for the same reason — and every call reaches Postgres. That makes
 * it the cheapest request on the site to send and one of the more expensive to
 * answer, which is exactly the shape worth bounding while nothing sits in front
 * of the origin (docs/EDGE_PROTECTION.md).
 *
 * The real callers are the Compose healthcheck every 30s, Caddy, and an uptime
 * monitor: single figures per minute between them, all from distinct addresses.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_HEALTH_PER_MINUTE', 60),
  60_000,
)

export async function GET(request: Request) {
  const allowance = limiter.check(clientKey(request.headers))
  if (!allowance.allowed) return tooManyRequests(allowance.resetAt)

  try {
    const payload = await getPayloadClient()
    // A single row, not a count. `count` is a sequential scan in Postgres, so
    // the probe grew more expensive with every article published — and the
    // question being asked is only whether the pool can reach the database,
    // which one row answers just as well. `pagination: false` matters here:
    // without it Payload issues the count query anyway, and the change buys
    // nothing.
    await payload.find({
      collection: 'posts',
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { slug: true },
    })
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      time: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'down', time: new Date().toISOString() },
      { status: 503 },
    )
  }
}
