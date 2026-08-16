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
