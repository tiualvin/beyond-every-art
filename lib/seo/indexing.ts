// Staging protection helpers: keep non-production deployments out of search
// indexes and, optionally, behind HTTP Basic Auth. Pure and env-driven so they
// can be unit-tested and reused by robots.ts, the frontend metadata, and
// middleware.
//
//   NEXT_PUBLIC_NOINDEX=1            -> robots Disallow: / and <meta noindex>
//   STAGING_BASIC_AUTH=user:password -> middleware requires Basic Auth

type Env = Record<string, string | undefined>

/** True when the deployment should be hidden from search engines. */
export function isNoindex(env: Env = process.env): boolean {
  const value = (env.NEXT_PUBLIC_NOINDEX ?? '').toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

/** What a `robots` meta tag says, in the shape Next's Metadata accepts. */
export type RobotsDirective =
  { index: false; follow: boolean } | typeof INDEXABLE

/**
 * What an indexable page permits: large image previews, and nothing else.
 *
 * Google shows an image at full width — the large card in Discover, the big
 * thumbnail beside a search result — only on pages that allow it with
 * `max-image-preview:large`; without it the preview is capped at the standard
 * size, and Discover's own documentation names the directive as a condition
 * for large images. For a publication whose articles are about paintings and
 * pigments, the image is most of the reason to tap. It says nothing about
 * whether a page is indexed, so it cannot un-hide anything.
 */
const INDEXABLE = { 'max-image-preview': 'large' } as const

/**
 * The robots directive a page carries. Every page that sets `robots` sets it
 * from this; the layout does too, and pages that set nothing inherit that.
 *
 * Never `{ index: true }`. `app/(frontend)/layout.tsx` is where the
 * deployment-wide `NEXT_PUBLIC_NOINDEX` switch lives, and a page that
 * cheerfully announced `index: true` would silently un-hide it on staging. The
 * staging answer is checked first, so nothing a page passes can outrank it.
 *
 * Never undefined either, which is what this used to return for an ordinary
 * document. Next's metadata merge treats `robots: undefined` as a value: the
 * key is present, so the page's nothing replaces the layout's something. The
 * search page did exactly that — `robots: query ? … : undefined` — and so on
 * staging an empty search page carried no noindex at all. Returning a
 * directive in every case, and routing every page through here, is what makes
 * the override harmless. `tests/seo/indexing.test.ts` checks the routing.
 *
 * A document marked noindex still gets `follow`, which is the standard
 * treatment for a page that should not rank but should still pass its links on
 * — an ad landing page linking into the archive being the case this exists for.
 */
export function robotsDirective(
  documentNoindex: boolean | null | undefined,
  env: Env = process.env,
): RobotsDirective {
  if (isNoindex(env)) return { index: false, follow: false }
  if (documentNoindex) return { index: false, follow: true }
  return INDEXABLE
}

export interface BasicAuthCredentials {
  user: string
  password: string
}

/** Parse `STAGING_BASIC_AUTH="user:password"`, or null when unset/malformed. */
export function parseBasicAuth(
  env: Env = process.env,
): BasicAuthCredentials | null {
  const raw = env.STAGING_BASIC_AUTH
  if (!raw) return null
  const separator = raw.indexOf(':')
  if (separator <= 0) return null
  return {
    user: raw.slice(0, separator),
    password: raw.slice(separator + 1),
  }
}

/**
 * Compare two strings in time that does not depend on where they first differ.
 *
 * `===` returns as soon as it finds a mismatched character, so the time it
 * takes is a measurement of how much of the guess was right — which is enough,
 * over enough samples, to recover a credential one character at a time. The
 * whole comparison is done here instead, and the verdict read at the end.
 *
 * Hand-rolled because this runs in the Edge runtime, which has no
 * `node:crypto` and therefore no `timingSafeEqual` — the function
 * `lib/billing/stripe-signature.ts` uses for the same reason on the Node side.
 * The lengths are folded into the accumulator rather than compared first, so an
 * early return cannot reintroduce the leak.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length
  const length = Math.max(a.length, b.length)

  for (let index = 0; index < length; index += 1) {
    // Past the end of the shorter string `charCodeAt` gives NaN; `|| 0` keeps
    // the XOR meaningful without branching on which string ran out.
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
  }

  return mismatch === 0
}

/**
 * Validate an `Authorization: Basic ...` header against expected credentials.
 * Uses atob, which is available in both the Edge runtime and Node.
 */
export function isAuthorized(
  header: string | null | undefined,
  creds: BasicAuthCredentials,
): boolean {
  if (!header || !header.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = atob(header.slice('Basic '.length))
  } catch {
    return false
  }
  const separator = decoded.indexOf(':')
  if (separator < 0) return false
  const user = decoded.slice(0, separator)
  const password = decoded.slice(separator + 1)
  // Both halves are always compared, so the answer does not arrive sooner for
  // a wrong username than for a wrong password.
  const userMatches = constantTimeEquals(user, creds.user)
  const passwordMatches = constantTimeEquals(password, creds.password)
  return userMatches && passwordMatches
}
