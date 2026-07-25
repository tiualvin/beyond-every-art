// Structured logging for 404s.
//
// Server 500s are already emitted as JSON lines by `onRequestError` in
// instrumentation.ts. Missing URLs matter just as much during and after the
// Ghost cutover: a slug that stopped resolving, or a redirect that never landed,
// shows up as a 404 long before anyone reports it. This module turns a notable
// 404 into a single JSON line on stdout so the same log collector can spot the
// pattern.
//
// The filtering is deliberately conservative. Vulnerability scanners and asset
// probes generate far more 404s than real readers do, and drowning the log makes
// it useless — so anything that looks like a file request or a scanner path is
// dropped, and only page-like URLs are recorded.

/** Longest path/referrer we will write; bot traffic sends absurdly long URLs. */
const MAX_VALUE_LENGTH = 512

/** Anything ending in a file extension is an asset or a script probe. */
const ASSET_LIKE = /\.[a-z0-9]{1,8}$/i

/** Path prefixes that are always noise, never a missing page of ours. */
const NOISE_PREFIXES = [
  '/_next/',
  '/.well-known/',
  '/.git',
  '/.env',
  '/cgi-bin/',
  '/vendor/',
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-json',
]

export interface NotFoundEntry {
  level: 'warn'
  event: 'not_found'
  time: string
  path: string
  referrer: string | null
}

export interface NotFoundInput {
  path?: string | null
  referrer?: string | null
  now?: Date
}

/**
 * True when a 404 is worth a log line: a page-like path that a reader or a
 * search engine could plausibly have followed from the old Ghost site.
 */
export function isNotableNotFound(path: string | null | undefined): boolean {
  if (!path) return false
  if (!path.startsWith('/')) return false
  if (path.length > MAX_VALUE_LENGTH) return false

  // Compare without the query string: /post?utm_source=x is still /post.
  const pathname = path.split(/[?#]/)[0]
  if (pathname === '/') return false
  if (NOISE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false

  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
  if (ASSET_LIKE.test(lastSegment)) return false

  return true
}

function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH
    ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
    : value
}

/** Build the structured entry for a notable 404. */
export function buildNotFoundEntry(input: NotFoundInput): NotFoundEntry | null {
  if (!isNotableNotFound(input.path)) return null
  return {
    level: 'warn',
    event: 'not_found',
    time: (input.now ?? new Date()).toISOString(),
    path: truncate(input.path as string),
    referrer: input.referrer ? truncate(input.referrer) : null,
  }
}

/**
 * Emit one JSON line for a notable 404. Silently ignores anything filtered out
 * by `isNotableNotFound`, and never throws: logging must not break a 404 page.
 */
export function logNotFound(input: NotFoundInput): void {
  try {
    const entry = buildNotFoundEntry(input)
    if (entry) console.warn(JSON.stringify(entry))
  } catch {
    // Observability is best effort.
  }
}
