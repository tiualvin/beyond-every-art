// Refusals the MCP endpoint returns before the MCP handler is entered.
//
// `overrideAuth` runs inside a Payload endpoint, so whatever it throws is
// handled by Payload's `routeError`, and that helper is stricter than it looks:
//
//   status = err.status || 500
//   if (!isErrorPublic(err, config)) response = formatErrors(new APIError('Something went wrong.'))
//
// A plain `Error` carries no `status` and no `isPublic`, so both branches take
// the pessimistic path — the caller receives `500 Something went wrong.` and
// the message the throw site wrote is discarded before it leaves the server.
// That is the wrong answer twice over on this endpoint: a rate limit is not a
// server fault, and an agent told only that something went wrong has no reason
// to wait rather than retry immediately. The refusals below are `APIError`s
// with a real status and `isPublic: true` so the text survives the trip.
//
// Nothing here is reachable once a request is authenticated; a tool that throws
// is caught by the MCP SDK and returned as a JSON-RPC error instead, which is
// why the publish guard needs none of this.

import { APIError } from 'payload'

/**
 * Too many requests from one credential, or too many failed authentications
 * from one address.
 *
 * 429 rather than 500 because that is what it is, and because every MCP client
 * worth the name backs off on 429 and retries a 500. The seconds remaining are
 * in the message rather than only in a `Retry-After` header: Payload builds the
 * response from the error, so a thrown error cannot set headers, and the
 * message is the part an agent actually reads.
 */
export function rateLimitedError(message: string): APIError<null> {
  return new APIError(message, 429, null, true)
}

/**
 * A `GET` on the MCP endpoint.
 *
 * The plugin registers `GET /api/mcp` alongside the `POST`, runs the whole
 * authentication path for it, and then has `mcp-handler` answer
 * `{"error":{"code":-32000,"message":"Method not allowed."}}` inside an HTTP
 * 200 — because SSE is disabled and there is no stream to open.
 *
 * Two things follow from refusing it here instead. The transport spec says a
 * server that offers no SSE stream at the endpoint MUST answer 405, so this is
 * the status a client is looking for. And it is refused before any limiter or
 * database lookup runs, which matters because the failed-authentication budget
 * is keyed by source address and MCP callers arrive from a vendor's shared
 * cloud: without this, unauthenticated `GET` probes — a crawler, a client
 * testing for SSE, a connector validating a URL — spend a budget that exists
 * to bound key guessing, and could lock out an unrelated caller behind the
 * same address.
 */
export function methodNotAllowedError(): APIError<null> {
  return new APIError(
    'Method not allowed. The MCP endpoint accepts POST; it serves no SSE stream on GET.',
    405,
    null,
    true,
  )
}
