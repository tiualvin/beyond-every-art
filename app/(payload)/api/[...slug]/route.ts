import config from '@payload-config'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { issuerOrigin, oauthEnabled } from '@/lib/oauth/config'
import { MCP_PATH, wwwAuthenticate } from '@/lib/oauth/metadata'

const payloadPost = REST_POST(config)

/**
 * The request with the trailing slash `trailingSlash: true` puts on its URL
 * taken back off.
 *
 * `next.config.ts` serves every URL with a trailing slash, because that is the
 * shape Ghost's permalinks have and the shape this site advertises — so a call
 * to `/api/mcp` arrives here as `/api/mcp/`, one 308 later.
 *
 * Payload's own routing does not notice: Next hands it the path segments, and
 * a trailing slash adds no segment. The MCP transport does. It reads `req.url`
 * and compares that pathname with the path it was mounted at, so `/api/mcp/`
 * misses `/api/mcp` and every tool call is answered with a bare 404 — after
 * the key has already been authenticated, which is what makes it look like a
 * routing bug rather than a URL one.
 *
 * Normalising here rather than exempting `/api` from `trailingSlash` keeps one
 * URL shape across the site and keeps the correction next to the handlers that
 * need it. Only the pathname changes; the query string, method, headers and
 * body are the caller's.
 */
function withoutTrailingSlash(request: Request): Request {
  const url = new URL(request.url)
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return request

  url.pathname = url.pathname.slice(0, -1)
  // Built from the request itself rather than a spread of it: `method`, `body`
  // and the rest are prototype getters, so a spread quietly yields an empty GET.
  return new Request(url, request)
}

/**
 * The request with `?locale=en` added when it names no locale.
 *
 * With `localization.fallback: false` — which the site depends on, so a
 * translated page is never filled with English — Payload 3.90.2 leaves
 * `req.locale` null for a REST request that does not say which language it
 * wants, instead of taking the default locale as it does when fallback is on.
 * Its query validation then reads `req.locale.length` and answers any `where`
 * with a 500: `GET /api/posts?where[slug][equals]=…`, anonymous or not, failed
 * the day localization was switched on. The admin panel always sends a locale
 * and is unaffected.
 *
 * English is what such a request meant before there were other languages, and
 * what Payload itself would pick with fallback on. Only for reads and the MCP
 * endpoint: a write may carry its locale in the body, which a query parameter
 * would override.
 */
function withDefaultLocale(request: Request): Request {
  const url = new URL(request.url)
  if (url.searchParams.has('locale')) return request
  const read = ['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(request.method)
  if (!read && url.pathname !== MCP_PATH) return request
  url.searchParams.set('locale', DEFAULT_LOCALE)
  return new Request(url, request)
}

/** Wraps a Payload route handler so it sees the un-slashed URL. */
function normalized<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return (request, ...args) =>
    handler(withDefaultLocale(withoutTrailingSlash(request)), ...args)
}

/**
 * Adds the `WWW-Authenticate` challenge to an unauthenticated MCP request.
 *
 * This wrapper exists because Payload builds its error responses itself:
 * `routeError` constructs the `Response` from the thrown error, and an error
 * cannot carry headers, so there is no hook inside the plugin or the endpoint
 * that can attach one. The header has to go on afterwards.
 *
 * It is not a nicety. A client handed only an endpoint URL discovers everything
 * else from the 401: RFC 9728 says the challenge names the resource metadata
 * document, and that document names the authorization server. Without the
 * header a well-behaved client sees a bare 401, concludes the server is simply
 * refusing it, and never registers — which is precisely how this endpoint
 * behaved before the OAuth layer existed.
 *
 * Only when OAuth is switched on. Advertising a discovery document that would
 * 404 sends clients down a path that dead-ends, which is worse than the plain
 * 401 they get from an endpoint that only takes API keys.
 */
export async function POST(
  incoming: Request,
  context: { params: Promise<{ slug: string[] }> },
): Promise<Response> {
  const request = withDefaultLocale(withoutTrailingSlash(incoming))
  const response = await payloadPost(
    request as Parameters<typeof payloadPost>[0],
    context as Parameters<typeof payloadPost>[1],
  )

  if (response.status !== 401) return response

  const origin = issuerOrigin()
  if (!oauthEnabled() || !origin) return response
  if (new URL(request.url).pathname !== MCP_PATH) return response

  const headers = new Headers(response.headers)
  headers.set('WWW-Authenticate', wwwAuthenticate(origin))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// The MCP transport also mounts a `GET` for its event stream, and every other
// Payload route is reached through the same slashed URL, so they are all
// normalised rather than only the one that surfaced the problem.
export const GET = normalized(REST_GET(config))
export const DELETE = normalized(REST_DELETE(config))
export const PATCH = normalized(REST_PATCH(config))
export const PUT = normalized(REST_PUT(config))
export const OPTIONS = normalized(REST_OPTIONS(config))
