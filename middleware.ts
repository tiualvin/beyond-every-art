import { NextResponse, type NextRequest } from 'next/server'

import { isAuthorized, parseBasicAuth } from '@/lib/seo/indexing'
import {
  buildRedirectMap,
  matchRedirect,
  type RedirectRecord,
  type ResolvedRedirect,
} from '@/lib/seo/redirects'

const CACHE_TTL_MS = 60_000

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

  const response = await fetch(`${origin}/redirects-map`, {
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
    map = await loadRedirectMap(request.nextUrl.origin)
  } catch {
    // Never let redirect lookups take the site down; fall through instead.
    return NextResponse.next()
  }

  const hit = matchRedirect(map, request.nextUrl.pathname)
  if (!hit) return NextResponse.next()

  const destination = /^https?:\/\//i.test(hit.destination)
    ? hit.destination
    : new URL(hit.destination, request.nextUrl.origin).toString()

  return NextResponse.redirect(destination, hit.statusCode)
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
  // `csp-report` is excluded for the same shape of reason. Browsers post
  // violation reports with no credentials, so on a staging deployment the Basic
  // Auth gate would answer every report with a 401 — and staging, where the
  // policy is tuned before enforcement, is precisely where the reports need to
  // arrive. Each report would also pull the redirect map for nothing.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|admin|api|webhooks|csp-report|redirects-map|sitemap.xml|robots.txt|rss|.*\\..*).*)',
  ],
}
