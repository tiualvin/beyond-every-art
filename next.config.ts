import { withPayload } from '@payloadcms/next/withPayload'

import type { NextConfig } from 'next'

import { buildSecurityHeaders } from './lib/security/headers'
import { buildImageConfig } from './lib/security/images'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Ghost served every permalink with a trailing slash, and those are the URLs
  // search engines have indexed and other sites link to. Without this, Next
  // redirects `/a-post/` to `/a-post` while `lib/seo/site.ts` advertises the
  // slashed form in canonical tags, the sitemap, and the feed — so every URL we
  // publish is one that bounces, and the page a crawler lands on claims its
  // real address is the URL it just came from. Serving the slashed form
  // directly is what makes the migrated URLs keep working exactly as they are.
  //
  // It applies to every route, including the ones that are not pages, so a
  // caller of `/health` or `/webhooks/stripe` has to use the slash too. Those
  // are updated alongside this; docs/SEO_AND_REDIRECTS.md has the list.
  trailingSlash: true,
  // `X-Powered-By: Next.js, Payload` otherwise names the framework and the CMS
  // on every response, which is free reconnaissance and buys nothing.
  poweredByHeader: false,
  // The policy is attached here rather than in `middleware.ts` because the
  // middleware matcher deliberately skips `/admin`, `/api`, and `/webhooks`,
  // and the Payload admin is exactly the surface that must not be left
  // uncovered. Config headers apply to every route, including those.
  //
  // The trade-off is that a config header is static, so it cannot carry a
  // per-request nonce. That is what keeps `'unsafe-inline'` in `script-src`
  // today; docs/CONTENT_SECURITY_POLICY.md covers the move to nonces.
  async headers() {
    const headers = buildSecurityHeaders({
      isDevelopment: process.env.NODE_ENV === 'development',
    })
    if (headers.length === 0) return []
    return [{ source: '/:path*', headers }]
  },
  // The image optimizer, bounded. See `lib/security/images.ts` for what each
  // clause closes and why the block does not live in this file: a config that
  // cannot be imported is a policy that cannot be unit-tested.
  images: buildImageConfig(),
  reactStrictMode: true,
}

export default withPayload(nextConfig)
