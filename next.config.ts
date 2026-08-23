import { withPayload } from '@payloadcms/next/withPayload'

import type { NextConfig } from 'next'

import { buildSecurityHeaders } from './lib/security/headers'
import { buildImageConfig } from './lib/security/images'

const nextConfig: NextConfig = {
  output: 'standalone',
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
