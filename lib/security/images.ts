// What the Next.js image optimizer will accept.
//
// Split out of `next.config.ts` for the same reason `csp.ts` and `headers.ts`
// are: the config file cannot be unit-tested — importing it runs `withPayload`
// and boots the CMS — so a policy that only exists in there is a policy nobody
// can assert on. This is pure and env-driven, and `tests/security/images.test.ts`
// pins each clause to the bypass it closes.
//
// `/_next/image` is a public, unauthenticated endpoint that runs sharp on
// demand, and nothing else covers it: Caddy's `@staffOnly` matcher lists
// `/api*`, `/admin*`, `/oauth*` and `/redirects-map*` but not `/_next/*`, and
// `middleware.ts` excludes `_next/image` from its matcher deliberately. At the
// framework defaults it was the cheapest way on this deployment to spend both
// CPU and disk.

import type { NextConfig } from 'next'

type Env = Record<string, string | undefined>

type ImageConfig = NonNullable<NextConfig['images']>

/**
 * The one quality the site ever asks for.
 *
 * Next.js validates `q` as any integer from 1 to 100 and only checks it against
 * an allowed set when `qualities` is configured. Left unset that is 100 distinct
 * optimizations per width per image — 1,600 with the 16 default widths — each a
 * full decode and re-encode of the source, and each a file in
 * `.next/cache/images`, which has no size ceiling of its own.
 *
 * No component passes a `quality` prop, so every real request already asks for
 * `next/image`'s own default of 75. Pinning it costs nothing and removes the
 * other ninety-nine.
 */
export const ALLOWED_IMAGE_QUALITY = 75

/**
 * The only local path the optimizer may be pointed at.
 *
 * With `localPatterns` unset, Next's `hasLocalMatch` returns true for *any*
 * local path — and the optimizer resolves a local `url` by dispatching it
 * through the application's own request handler, path and query string intact,
 * without traversing Caddy. So
 * `/_next/image?url=%2Fapi%2Fposts%3Flimit%3D0&w=640&q=75` ran the unpaginated
 * full-table read the Caddyfile spends three paragraphs refusing, from the
 * hostname where it is refused.
 *
 * Nothing came back — a non-image is rejected with a 400 once the content type
 * is sniffed — so it was a work amplifier rather than a disclosure. The query
 * still ran, which is the part worth closing.
 *
 * Uploads are the only local images the site renders, so naming them is the
 * whole allowlist. `search: ''` requires an empty query string, which is what
 * Payload's own media URLs carry.
 */
export const LOCAL_IMAGE_PATTERN = {
  pathname: '/api/media/file/**',
  search: '',
} as const

/**
 * Remote hosts the optimizer may fetch from.
 *
 * Only the object-storage origin, and only when one is configured. An empty
 * list is not a gap: with no `S3_PUBLIC_URL` every media URL is root-relative
 * and covered by the local pattern above.
 */
export function imageRemotePatterns(
  env: Env = process.env,
): ImageConfig['remotePatterns'] {
  const publicUrl = env.S3_PUBLIC_URL
  if (!publicUrl) return []
  return [{ hostname: new URL(publicUrl).hostname, protocol: 'https' }]
}

/** The whole `images` block, as `next.config.ts` should hand it to Next.js. */
export function buildImageConfig(env: Env = process.env): ImageConfig {
  return {
    qualities: [ALLOWED_IMAGE_QUALITY],
    localPatterns: [{ ...LOCAL_IMAGE_PATTERN }],
    remotePatterns: imageRemotePatterns(env),
  }
}
