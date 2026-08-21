import { NextResponse, type NextRequest } from 'next/server'

import {
  configuredLimit,
  clientKey,
  FixedWindowRateLimiter,
  TOO_MANY_REQUESTS_BODY,
  tooManyRequestsInit,
} from '@/lib/security/rate-limit'
import { forwardedOrigin, internalOrigin } from '@/lib/security/origins'
import { isAuthorized, parseBasicAuth } from '@/lib/seo/indexing'
import {
  buildRedirectMap,
  matchRedirect,
  redirectLocation,
  type RedirectRecord,
  type ResolvedRedirect,
} from '@/lib/seo/redirects'

const CACHE_TTL_MS = 60_000

/**
 * Password reset is the only place on this site where an anonymous request
 * spends money.
 *
 * `POST /api/users/forgot-password` sends a transactional email through Resend
 * on every call, whether or not the address belongs to anyone. Left open that
 * is a bill, a quota (the free tier is a few thousand a month) and a sending
 * reputation, all spendable by a stranger with a loop. Payload has no rate
 * limiting of its own in v3, so the bound has to be here — in front of the
 * route, since Payload owns everything under `/api`.
 *
 * Three an hour is a person who has genuinely lost their password twice.
 */
const forgotPasswordLimiter = new FixedWindowRateLimiter(3, 60 * 60_000)

/**
 * Login is bounded too, for a different reason.
 *
 * Payload locks an individual account after five failed attempts, which stops
 * password guessing but does nothing about volume: each attempt still costs a
 * user lookup and a bcrypt comparison, which is deliberately expensive. This
 * caps how many of those a single source can buy.
 *
 * Configurable for the same reason the other limiters are: the end-to-end suite
 * drives every flow from one address, and the OAuth spec signs in once per test
 * — which, with CI's retries, goes past a production-tight allowance and fails
 * as a rate limit rather than as the bug it looks like. Twenty stays the policy;
 * `playwright.config.ts` raises it for the suite only.
 */
const loginLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_LOGIN_PER_15M', 20),
  15 * 60_000,
)

/** The auth routes above, matched against the pathname Payload serves them on. */
function authLimiterFor(pathname: string): FixedWindowRateLimiter | null {
  if (pathname.startsWith('/api/users/forgot-password')) {
    return forgotPasswordLimiter
  }
  if (pathname.startsWith('/api/users/login')) return loginLimiter
  return null
}

type RedirectCache = {
  map: Map<string, ResolvedRedirect>
  expiresAt: number
}

let cache: RedirectCache | null = null

async function loadRedirectMap(
  origin: string,
): Promise<Map<string, ResolvedRedirect>> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.map

  const response = await fetch(`${origin}/redirects-map/`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok)
    throw new Error(`redirects-map responded ${response.status}`)

  const data = (await response.json()) as { redirects?: RedirectRecord[] }
  const map = buildRedirectMap(data.redirects ?? [])
  cache = { map, expiresAt: now + CACHE_TTL_MS }
  return map
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Payload's auth routes are matched only so they can be rate limited. They
  // return here rather than falling through: the Basic Auth gate below has
  // never covered `/api` and enabling it now would answer the admin panel's own
  // login request with a 401 on staging, and the redirect map has nothing to
  // say about an endpoint Payload owns.
  const authLimiter = authLimiterFor(request.nextUrl.pathname)
  if (authLimiter) {
    const allowance = authLimiter.check(clientKey(request.headers))
    if (!allowance.allowed) {
      return NextResponse.json(
        TOO_MANY_REQUESTS_BODY,
        tooManyRequestsInit(allowance.resetAt),
      )
    }
    return NextResponse.next()
  }

  // Optional HTTP Basic Auth gate for staging deployments. The /health probe
  // stays open so container healthchecks and uptime monitors can reach it.
  if (request.nextUrl.pathname !== '/health') {
    const credentials = parseBasicAuth(process.env)
    if (
      credentials &&
      !isAuthorized(request.headers.get('authorization'), credentials)
    ) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Staging", charset="UTF-8"',
        },
      })
    }
  }

  let map: Map<string, ResolvedRedirect>
  try {
    // Not `request.nextUrl.origin`: that is the bind address wearing the
    // forwarded scheme, which behind Caddy is `https://0.0.0.0:3000` and fails
    // the TLS handshake against a plain-HTTP listener. See `internalOrigin`.
    map = await loadRedirectMap(internalOrigin())
  } catch (error) {
    // Never let redirect lookups take the site down; fall through instead.
    //
    // Falling through silently, though, means every migrated Ghost URL starts
    // answering 404 with nothing anywhere saying why — an SEO failure that
    // looks exactly like normal operation from in here. One line per failure
    // makes it something `docker compose logs app` can find.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'redirect_map_unavailable',
        time: new Date().toISOString(),
        message:
          'Could not load the redirect map; migrated URLs will not redirect ' +
          'until this succeeds.',
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    return NextResponse.next()
  }

  const hit = matchRedirect(map, request.nextUrl.pathname)
  if (!hit) return NextResponse.next()

  // Resolved against the origin the reader used, not `request.nextUrl.origin`
  // — which is the bind address wearing the forwarded scheme, and sent every
  // migrated URL to `https://0.0.0.0:3000`. `nextUrl.origin` remains the last
  // resort for a request that arrived with no host at all, which HTTP/1.1 and
  // HTTP/2 both require and so should not happen.
  const location = redirectLocation(
    hit.destination,
    forwardedOrigin(request.headers, request.nextUrl.origin),
  )

  return NextResponse.redirect(location, hit.statusCode)
}

export const config = {
  // Run on page-like requests only; skip Next internals, the Payload admin and
  // API, the redirects data endpoint itself, generated SEO files, and any path
  // that looks like a static asset (contains a dot).
  //
  // `webhooks` is excluded for a reason that fails silently otherwise: billing
  // providers call /webhooks/* with a signed body and no credentials. With
  // STAGING_BASIC_AUTH set, the gate above would answer every one of them with
  // a 401 — Stripe retries for about three days and can then disable the
  // endpoint — and every call would also trigger a redirect-map fetch it has no
  // use for. The endpoints authenticate themselves by signature instead.
  //
  // `oauth` is excluded for a third instance of the same shape. The
  // authorization endpoints are how a credential is *obtained*, so a gate in
  // front of them has nothing to check yet: with STAGING_BASIC_AUTH set, a
  // connector's registration and token calls would be answered 401 by the
  // staging gate rather than by the OAuth layer, and the consent page would
  // prompt for a second, unrelated password before the person could approve
  // anything. `/.well-known/*` needs no entry — it contains a dot, so the
  // asset rule at the end of this matcher already excludes it.
  //
  // `csp-report` is excluded for the same shape of reason. Browsers post
  // violation reports with no credentials, so on a staging deployment the Basic
  // Auth gate would answer every report with a 401 — and staging, where the
  // policy is tuned before enforcement, is precisely where the reports need to
  // arrive. Each report would also pull the redirect map for nothing.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|admin|api|oauth|webhooks|csp-report|redirects-map|sitemap.xml|robots.txt|rss|.*\\..*).*)',
    // The one deliberate exception to the `api` exclusion above. Payload's
    // auth routes are matched so `authLimiterFor` can throttle them, and the
    // handler returns immediately for anything it matches, so nothing else in
    // this middleware applies to them.
    '/api/users/:path*',
  ],
}
