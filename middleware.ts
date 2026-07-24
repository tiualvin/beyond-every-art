import { NextResponse, type NextRequest } from 'next/server'

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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|admin|api|redirects-map|sitemap.xml|robots.txt|rss|.*\\..*).*)',
  ],
}
