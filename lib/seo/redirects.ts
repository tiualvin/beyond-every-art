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
