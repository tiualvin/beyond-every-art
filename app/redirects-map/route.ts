import { getPayloadClient } from '@/lib/payload'
import type { RedirectRecord } from '@/lib/seo/redirects'

export const dynamic = 'force-dynamic'

/**
 * Publishes the enabled redirect rules as JSON for the edge middleware to
 * consume. Middleware runs on the edge runtime and cannot reach Postgres
 * directly, so it fetches (and caches) this Node-runtime endpoint instead.
 */
export async function GET(): Promise<Response> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'redirects',
      overrideAccess: true,
      depth: 0,
      pagination: false,
      limit: 0,
      where: { enabled: { not_equals: false } },
    })

    const redirects: RedirectRecord[] = result.docs.map((doc) => ({
      source: String(doc.source ?? ''),
      destination: String(doc.destination ?? ''),
      statusCode: (doc.statusCode as RedirectRecord['statusCode']) ?? '301',
      enabled: doc.enabled !== false,
    }))

    return Response.json(
      { redirects },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    )
  } catch {
    return Response.json({ redirects: [] }, { status: 200 })
  }
}
