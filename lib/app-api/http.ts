// What every content API response shares: the switch, the limits, the headers.
//
// Off unless `APP_API_ENABLED=1`, the way the MCP endpoint is off unless
// `MCP_ENABLED=1`: a deployment gains a public endpoint only when somebody
// decides it should have one. Off, every path answers 404 to every method
// before anything is read or counted — `middleware.ts` for the whole prefix,
// and each handler again for itself. The variable is set in
// `playwright.config.ts` for the test server and nowhere else; turning it on in
// production is the owner's decision (docs/COMPANION_APP.md).

import type { z } from 'zod/v4'

import { CONTENT_TTL_SECONDS } from '../cache/ttl'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  retryAfterSeconds,
  TOO_MANY_REQUESTS_BODY,
} from '../security/rate-limit'
import { appApiEnabled, NOT_FOUND_BODY, UNCACHED_HEADERS } from './switch'

export { appApiEnabled }

/**
 * Reads per source address per minute.
 *
 * A reader opening articles in the app makes a request or two per screen, and
 * the app caches what it reads; a hundred and twenty a minute is a reader who
 * never stops scrolling. Per container, like every limiter here: Cloudflare is
 * the first line, this is the bound the application keeps for itself.
 */
export const readLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_APP_API_PER_MINUTE', 120),
  60_000,
)

/**
 * Searches per source address per minute: tighter, because a search is a scan
 * of the posts table and its cache is keyed on whatever text was sent.
 */
export const searchLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_APP_API_SEARCH_PER_MINUTE', 30),
  60_000,
)

/**
 * Fresh for half the content cache's lifetime, then usable stale for the other
 * half while revalidated. The website releases on a ten-minute cache
 * (`CONTENT_TTL_SECONDS`), so a client holding an answer this long is never
 * further behind than the website itself can be.
 */
export const CACHE_CONTROL = `public, max-age=${CONTENT_TTL_SECONDS / 2}, stale-while-revalidate=${CONTENT_TTL_SECONDS / 2}`

/** JSON, kept out of search results, cached only when it is an answer. */
export function respond(
  body: unknown,
  {
    status = 200,
    headers = {},
  }: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...UNCACHED_HEADERS,
      ...(status === 200 ? { 'Cache-Control': CACHE_CONTROL } : {}),
      ...headers,
    },
  })
}

/**
 * An answer, parsed through its contract schema on the way out. Parsing drops
 * any key the schema does not name, so a field nobody listed cannot be sent;
 * a value that breaks the contract is a 500 here, not a broken client there.
 */
export function respondWith<T>(schema: z.ZodType<T>, body: T): Response {
  return respond(schema.parse(body))
}

export const notFound = (): Response => respond(NOT_FOUND_BODY, { status: 404 })

export const badRequest = (error: string): Response =>
  respond({ error }, { status: 400 })

type RouteContext<P> = { params: Promise<P> }

/**
 * A handler with the switch, the limit and the failure answer in front of it.
 *
 * The switch comes first and spends nothing: an API that is off answers 404,
 * with no read, no count and nothing cached. Middleware has already answered
 * so for every method; this keeps the handler closed on its own.
 */
export function appApiRoute<P = Record<string, never>>(
  handle: (request: Request, params: P) => Promise<Response>,
  { limiter = readLimiter }: { limiter?: FixedWindowRateLimiter } = {},
) {
  return async (
    request: Request,
    context: RouteContext<P>,
  ): Promise<Response> => {
    if (!appApiEnabled()) return notFound()

    const allowance = limiter.check(clientKey(request.headers))
    if (!allowance.allowed) {
      return respond(TOO_MANY_REQUESTS_BODY, {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds(allowance.resetAt)),
        },
      })
    }

    try {
      return await handle(request, await context.params)
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'app_api_failed',
          time: new Date().toISOString(),
          path: new URL(request.url).pathname,
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
      return respond({ error: 'Server error' }, { status: 500 })
    }
  }
}

/** A query parameter that must be a positive integer, or null when it is not. */
export function positiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback
  return /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null
}
