import type { MetadataRoute } from 'next'

import { isNoindex } from '@/lib/seo/indexing'
import { getSiteUrl, MEDIA_FILE_PATH } from '@/lib/seo/site'

// Evaluate per request so NEXT_PUBLIC_NOINDEX takes effect from the runtime
// environment, not only from the value present at build time.
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  // On staging (NEXT_PUBLIC_NOINDEX), disallow everything so the pre-launch
  // site never enters a search index and dilutes the production URLs.
  if (isNoindex()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        // `/api/media/file/` is where every upload is served from, and it sits
        // under the `/api` prefix disallowed below. Without this line a crawler
        // may fetch the article but not its images: the `og:image` and the
        // Article JSON-LD `image` both point there, so Google could not read
        // the picture that Discover and article rich results are built from.
        // Ghost served the same files from `/content/images/`, which nothing
        // disallowed, so this was lost in the migration rather than never had.
        //
        // Crawlers apply the longest matching rule (RFC 9309), so this longer
        // Allow wins over `Disallow: /api` for uploads and for nothing else:
        // `/api/media` itself, the collection endpoint, stays disallowed — and
        // Caddy refuses it on this hostname anyway. The files are already
        // public; the Caddyfile's `@staffOnly` matcher exempts exactly this
        // prefix, and `tests/seo/robots.test.ts` keeps the two in step.
        allow: ['/', MEDIA_FILE_PATH],
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
