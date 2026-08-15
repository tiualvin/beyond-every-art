import { NextResponse } from 'next/server'

import { getPayloadClient } from '@/lib/payload'
import { HEALTH_PROBE_QUERY } from '@/lib/observability/health'

// Liveness + database readiness probe for the reverse proxy, container
// healthcheck, and external uptime monitoring. Always dynamic so it reflects
// the current database state rather than a cached response.
export const dynamic = 'force-dynamic'

export async function GET() {
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
