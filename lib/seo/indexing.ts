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
  return user === creds.user && password === creds.password
}
