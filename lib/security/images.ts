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
 * Remote hosts the optimizer may fetch from, and where on them.
 *
 * Only the object-storage origin, and only when one is configured. An empty
 * list is not a gap: with no `S3_PUBLIC_URL` every media URL is root-relative
 * and covered by the local pattern above.
 *
 * The `pathname` is the half that was missing. A pattern naming only a hostname
 * matches every path on it, and Next resolves a remote `url` by *fetching it*
 * before it can decide the response is not an image — so
 * `/_next/image?url=https://<bucket-host>/<anything>&w=640&q=75` would make the
 * server issue a request to object storage for a key that need not exist. The
 * 400 the caller gets back is the cheap half; the billed GET against R2 has
 * already happened, and a miss is not written to `.next/cache/images`, so the
 * same URL buys another one every time it is sent. One inbound request, one
 * metered storage operation, repeatable for as long as somebody cared to.
 *
 * Conditional, and worth saying so rather than leaving it read as a live hole.
 * `S3_PUBLIC_URL` is deliberately empty on this deployment — Payload streams
 * media from `/api/media/file/<name>` and the bucket stays private, see
 * `docs/DEPLOYMENT_STATUS.md` — so this function returns `[]` today and Next
 * refuses every remote `url` outright. What the prefix closes is the step after
 * the one the deployment notes describe as plausible: give the media bucket a
 * custom domain, set this variable, and a hostname-only pattern would open the
 * whole bucket to it. The bound belongs here, before that happens, not after.
 *
 * Scoping to the prefix `S3_PUBLIC_URL` actually carries does not make that
 * free — a real object still costs its fetch — but it bounds the reachable key
 * space to the one media lives under. The volume half is `middleware.ts`,
 * which now rate limits `/_next/image`; neither is sufficient alone.
 *
 * `search: ''` for the same reason `LOCAL_IMAGE_PATTERN` has it: Payload's
 * storage URLs carry no query string, so anything appended to one is somebody
 * else's idea.
 */
export function imageRemotePatterns(
  env: Env = process.env,
): ImageConfig['remotePatterns'] {
  const publicUrl = env.S3_PUBLIC_URL
  if (!publicUrl) return []

  let parsed: URL
  try {
    parsed = new URL(publicUrl)
  } catch {
    // A malformed value used to throw here and take the whole config with it,
    // which fails the build rather than the variable. An unusable public URL
    // means no remote host is allowed — the same answer as not setting one.
    return []
  }

  // `https://media.example.com` and `https://media.example.com/files` are both
  // valid values, and the second is a prefix every media URL sits under.
  const prefix = parsed.pathname.replace(/\/+$/, '')

  return [
    {
      hostname: parsed.hostname,
      protocol: 'https',
      pathname: `${prefix}/**`,
      search: '',
    },
  ]
}

/** The whole `images` block, as `next.config.ts` should hand it to Next.js. */
export function buildImageConfig(env: Env = process.env): ImageConfig {
  return {
    qualities: [ALLOWED_IMAGE_QUALITY],
    localPatterns: [{ ...LOCAL_IMAGE_PATTERN }],
    remotePatterns: imageRemotePatterns(env),
  }
}
