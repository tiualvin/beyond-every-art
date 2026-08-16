export type RedirectRecord = {
  source: string
  destination: string
  statusCode?: string | number | null
  enabled?: boolean | null
}

export type ResolvedRedirect = {
  destination: string
  statusCode: RedirectStatus
}

export type RedirectStatus = 301 | 302 | 307 | 308

const VALID_STATUSES = new Set<RedirectStatus>([301, 302, 307, 308])
const DEFAULT_STATUS: RedirectStatus = 301

/**
 * Canonicalizes a request path so that stored redirect sources and incoming
 * request paths compare equal regardless of trailing-slash, duplicate-slash, or
 * percent-encoding differences. Query strings and fragments are dropped — the
 * Redirects collection keys on path only.
 */
export function normalizePath(pathname: string): string {
  if (!pathname) return '/'

  let path = pathname.trim()

  // Drop query string and fragment.
  path = path.split(/[?#]/)[0]

  try {
    path = decodeURI(path)
  } catch {
    // Leave malformed encodings as-is rather than throwing.
  }

  if (!path.startsWith('/')) path = `/${path}`
  path = path.replace(/\/{2,}/g, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')

  return path
}

function coerceStatus(value: RedirectRecord['statusCode']): RedirectStatus {
  const code = Number(value)
  return VALID_STATUSES.has(code as RedirectStatus)
    ? (code as RedirectStatus)
    : DEFAULT_STATUS
}

/**
 * Builds a lookup map from normalized source path to resolved redirect. Disabled
 * records and rows missing a source or destination are skipped. When two records
 * normalize to the same source, the last one wins.
 */
export function buildRedirectMap(
  records: readonly RedirectRecord[],
): Map<string, ResolvedRedirect> {
  const map = new Map<string, ResolvedRedirect>()

  for (const record of records) {
    if (record.enabled === false) continue
    if (!record.source || !record.destination) continue

    map.set(normalizePath(record.source), {
      destination: record.destination,
      statusCode: coerceStatus(record.statusCode),
    })
  }

  return map
}

/** Resolves a request path against a prepared redirect map. */
export function matchRedirect(
  map: Map<string, ResolvedRedirect>,
  pathname: string,
): ResolvedRedirect | null {
  return map.get(normalizePath(pathname)) ?? null
}

/**
 * The `Location` header value for a matched redirect.
 *
 * An off-site destination is sent exactly as stored. An on-site one is resolved
 * against `origin`, which must be the origin the reader used — see
 * `forwardedOrigin`.
 *
 * Which origin is the whole point of this function existing. Middleware
 * previously resolved against `request.nextUrl.origin`, and Next builds that
 * from `HOSTNAME` and the port rather than from the request, so behind Caddy it
 * is `https://0.0.0.0:3000`: every migrated Ghost URL redirected readers and
 * crawlers to an address nothing can route to. Staying relative is not an
 * option either — Next's edge adapter parses the `Location` header as a URL and
 * throws on a relative one — so the only fix is to resolve against the right
 * origin and to keep the choice of origin out of this file.
 *
 * A destination that will not parse falls back to being sent as stored, which
 * is what the redirect table asked for, rather than throwing inside middleware
 * and turning a redirect into a 500.
 */
export function redirectLocation(destination: string, origin: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(destination)) return destination
  // Protocol-relative (`//host/path`) is already absolute to a browser.
  if (destination.startsWith('//')) return destination

  const path = destination.startsWith('/') ? destination : `/${destination}`
  try {
    return new URL(path, origin).toString()
  } catch {
    return path
  }
}
