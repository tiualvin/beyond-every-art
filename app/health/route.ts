import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload'
import { HEALTH_PROBE_QUERY } from '@/lib/observability/health'
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
 * The query behind this is constant time now (see `HEALTH_PROBE_QUERY`), which
 * removes the part that got worse as the archive grew but not the part where an
 * anonymous caller can ask for it as fast as they can send requests. It is
 * reachable without credentials on purpose — a probe cannot authenticate, and
 * `middleware.ts` exempts it from the staging Basic Auth gate for that reason —
 * so it stays the cheapest request on the site to send, and nothing sits in
 * front of the origin to bound the volume (docs/EDGE_PROTECTION.md).
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
    // Proves the pool can reach Postgres, in constant time. See the query.
    await payload.find(HEALTH_PROBE_QUERY)
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
