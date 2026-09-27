import { indexNowKey } from '@/lib/seo/indexnow'

// The IndexNow key file. An engine receiving a submission fetches this and
// compares its body with the key in the request, which is how it knows the
// submission came from whoever controls the site. Named to it as `keyLocation`,
// so the file does not have to be called `<key>.txt`; at the root, so it
// vouches for every URL on the host. See `lib/seo/indexnow.ts`.
//
// Served by Next rather than Caddy, unlike `/ads.txt`: this is a value from the
// environment, not a committed file. The dot in the path keeps it clear of both
// `trailingSlash` (Next treats a last segment with an extension as a file and
// serves it as named) and the middleware, whose matcher skips dotted paths;
// `e2e/seo-and-health.spec.ts` asserts it answers without a redirect.

// Per request, so the key comes from the running container's environment.
export const dynamic = 'force-dynamic'

export function GET(): Response {
  const key = indexNowKey()
  if (!key) return new Response('Not found', { status: 404 })
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      // A key file in search results helps nobody.
      'X-Robots-Tag': 'noindex',
    },
  })
}
