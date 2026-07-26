import {
  logCspViolations,
  parseCspPayload,
} from '@/lib/observability/csp-report'

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

export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return NO_CONTENT
    }

    const text = await request.text()
    // `content-length` is a claim; check the body actually received too.
    if (text.length > MAX_BODY_BYTES) return NO_CONTENT

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
