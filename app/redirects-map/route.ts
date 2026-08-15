import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { getPayloadClient } from '@/lib/payload'
import type { RedirectRecord } from '@/lib/seo/redirects'

export const dynamic = 'force-dynamic'

/**
 * The enabled redirect rules, read once and shared between requests.
 *
 * This is a `pagination: false` read of the whole collection, and the route in
 * front of it is reachable without credentials, so uncached it was a full table
 * scan that anyone could ask for as fast as they could send requests — the same
 * shape of problem search had before it was cached, and the last read on the
 * site that still went straight to Postgres on every call.
 *
 * Purged by the collection's own hooks rather than left to the ten-minute
 * backstop, because a redirect that takes ten minutes to start working is a
 * redirect that was broken when someone needed it.
 */
const readRedirects = cachedRead(
  'redirects-map',
  async (): Promise<RedirectRecord[]> => {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'redirects',
      overrideAccess: true,
      depth: 0,
      pagination: false,
      limit: 0,
      where: { enabled: { not_equals: false } },
      select: {
        source: true,
        destination: true,
        statusCode: true,
        enabled: true,
      },
    })

    return result.docs.map((doc) => ({
      source: String(doc.source ?? ''),
      destination: String(doc.destination ?? ''),
      statusCode: (doc.statusCode as RedirectRecord['statusCode']) ?? '301',
      enabled: doc.enabled !== false,
    }))
  },
  [CONTENT_TAGS.redirects],
)

/**
 * Publishes the enabled redirect rules as JSON for the edge middleware to
 * consume. Middleware runs on the edge runtime and cannot reach Postgres
 * directly, so it fetches (and caches) this Node-runtime endpoint instead.
 *
 * Caddy answers this path with a 404 on the public hostname. The middleware's
 * own fetch is unaffected: it resolves the server's bind address rather than
 * the request's `Host` header, so it connects to the app directly and never
 * traverses the proxy. If that ever stops being true the symptom is redirects
 * quietly not firing, which is why `middleware.ts` now logs a failed load
 * instead of only swallowing it.
 */
export async function GET(): Promise<Response> {
  try {
    return Response.json(
      { redirects: await readRedirects() },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    )
  } catch {
    return Response.json({ redirects: [] }, { status: 200 })
  }
}
