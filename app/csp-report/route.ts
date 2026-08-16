import {
  logCspViolations,
  parseCspPayload,
} from '@/lib/observability/csp-report'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
} from '@/lib/security/rate-limit'
import { readBoundedText } from '@/lib/security/request-body'

// Violation sink for the Content-Security-Policy report-only rollout.
//
// Browsers POST here on their own schedule, from any visitor, with no
// credentials — and so can anyone else, since the endpoint has to be reachable
// unauthenticated to be useful. It is therefore written as an untrusted,
// unauthenticated ingest: bounded body, no persistence, no reflection of input,
// and always 204 so a caller learns nothing from the response.
//
// It deliberately does not write to Payload. One row per violation would put an
// attacker in charge of database growth, and the same reasoning already applies
// to `module-events` in docs/INSERTABLE_CONTENT_MODULES.md.
export const dynamic = 'force-dynamic'

/** Anything larger than this is not a report the browser generated. */
const MAX_BODY_BYTES = 16_000

const NO_CONTENT = new Response(null, { status: 204 })

/**
 * Reports accepted from one address per minute.
 *
 * Bounding the body was only half of it: an accepted report costs a log line,
 * and the container's log file is capped and rotated
 * (`LOG_MAX_SIZE` × `LOG_MAX_FILES` in docker-compose.yml). So a caller who can
 * post reports as fast as they like cannot fill the disk, but can roll the
 * window — pushing out the genuine violations this endpoint exists to collect,
 * during precisely the report-only phase when they are the only evidence there
 * is. A browser sends a handful per page at worst.
 *
 * Over the limit is still answered 204: a violation sink that starts returning
 * a different status is a violation sink that tells a prober it is there.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_CSP_REPORT_PER_MINUTE', 60),
  60_000,
)

export async function POST(request: Request): Promise<Response> {
  if (!limiter.check(clientKey(request.headers)).allowed) return NO_CONTENT

  try {
    const text = await readBoundedText(request, MAX_BODY_BYTES)
    logCspViolations(parseCspPayload(JSON.parse(text)))
  } catch {
    // Malformed JSON, a truncated body, a stray crawler: never worth an error
    // response, and never worth failing a request the browser sent on its own.
  }

  return NO_CONTENT
}

/**
 * A GET here is a person or a scanner, not a browser report. Answer plainly
 * rather than leaking whether the endpoint is wired up to anything.
 */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: 'POST' } })
}
