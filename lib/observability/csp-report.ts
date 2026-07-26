// Structured logging for CSP violation reports.
//
// The report-only phase is only worth running if somebody reads the output, so
// each violation becomes one JSON line next to the existing `request_error`,
// `not_found`, and `webhook_rejected` lines in `docker compose logs app`.
//
// Reports are attacker-influenced input: the browser posts whatever the page
// contained, and any origin can POST the endpoint directly. Nothing here is
// trusted — fields are length-capped, URLs are reduced to origin and path, and
// unknown shapes are dropped rather than logged raw.

/** Cap on any single logged field, so one report cannot flood the log. */
const MAX_FIELD = 200

/** Both report shapes: the legacy `report-uri` body and the Reporting API. */
type LegacyReport = {
  'csp-report'?: Record<string, unknown>
}

type ReportingApiEntry = {
  type?: unknown
  body?: Record<string, unknown>
}

export interface CspViolation {
  /** The directive that was violated, e.g. `script-src`. */
  directive: string | null
  /** What the page tried to load, reduced to origin + path. */
  blockedURI: string | null
  /** The document the violation happened on, reduced to origin + path. */
  documentURI: string | null
  /** Present when the browser could attribute it to a source file. */
  sourceFile: string | null
  /** `report-only` or `enforce`, as the browser saw it. */
  disposition: string | null
}

export interface CspLogEntry extends CspViolation {
  level: 'warn'
  event: 'csp_violation'
  time: string
}

function truncate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_FIELD)
}

/**
 * Reduce a URL to origin + path.
 *
 * A blocked or document URI can carry a query string, and on this site a query
 * string can carry a reader's search term (`/search/?q=...`). Keeping the path
 * is enough to find the offending page; keeping the query would put reader
 * input into a log store that has no reason to hold it.
 *
 * Non-URL values are kept as-is after truncation: the browser legitimately
 * sends bare keywords like `inline`, `eval`, and `data`.
 */
export function sanitizeUri(value: unknown): string | null {
  const raw = truncate(value)
  if (!raw) return null
  try {
    const url = new URL(raw)
    // `data:` and `blob:` have no meaningful origin and can embed a whole
    // payload, so report only the scheme.
    if (url.protocol === 'data:' || url.protocol === 'blob:') {
      return url.protocol
    }
    return `${url.origin}${url.pathname}`
  } catch {
    return raw
  }
}

/** Pull the violation out of either report shape, or null if unrecognized. */
export function parseCspReport(payload: unknown): CspViolation | null {
  if (!payload || typeof payload !== 'object') return null

  const legacy = (payload as LegacyReport)['csp-report']
  const body =
    legacy && typeof legacy === 'object'
      ? legacy
      : isReportingApiEntry(payload)
        ? payload.body
        : undefined

  if (!body || typeof body !== 'object') return null

  const directive =
    truncate(body['effective-directive']) ??
    truncate(body['effectiveDirective']) ??
    truncate(body['violated-directive']) ??
    truncate(body['violatedDirective'])

  const blockedURI =
    sanitizeUri(body['blocked-uri']) ?? sanitizeUri(body['blockedURL'])
  const documentURI =
    sanitizeUri(body['document-uri']) ?? sanitizeUri(body['documentURL'])
  const sourceFile =
    sanitizeUri(body['source-file']) ?? sanitizeUri(body['sourceFile'])
  const disposition = truncate(body['disposition'])

  // A report with neither a directive nor a blocked URI carries no information
  // worth a log line, and is the shape a junk POST arrives in.
  if (!directive && !blockedURI) return null

  return { directive, blockedURI, documentURI, sourceFile, disposition }
}

function isReportingApiEntry(value: unknown): value is ReportingApiEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'body' in value &&
    typeof (value as ReportingApiEntry).body === 'object'
  )
}

/** Reporting API posts an array; `report-uri` posts one object. */
export function parseCspPayload(payload: unknown): CspViolation[] {
  const entries = Array.isArray(payload) ? payload : [payload]
  return entries
    .map(parseCspReport)
    .filter((entry): entry is CspViolation => entry !== null)
}

export function buildCspLogEntry(
  violation: CspViolation,
  now: Date = new Date(),
): CspLogEntry {
  return {
    level: 'warn',
    event: 'csp_violation',
    time: now.toISOString(),
    ...violation,
  }
}

/** Emit one JSON line per violation. Never throws. */
export function logCspViolations(violations: CspViolation[]): void {
  for (const violation of violations) {
    try {
      console.warn(JSON.stringify(buildCspLogEntry(violation)))
    } catch {
      // Observability is best effort.
    }
  }
}
