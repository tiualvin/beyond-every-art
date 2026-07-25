import type { MetadataRoute } from 'next'

import { isNoindex } from '@/lib/seo/indexing'
import { getSiteUrl } from '@/lib/seo/site'

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
        allow: '/',
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  }
}
