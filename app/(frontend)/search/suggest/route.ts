import { NextResponse } from 'next/server'

import { searchPosts } from '@/lib/content/queries'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
  tooManyRequests,
} from '@/lib/security/rate-limit'
import { postPath } from '@/lib/seo/site'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

const LIMIT = 8

/**
 * Generous enough for typing, small enough to be worthless as a load generator.
 *
 * The drawer debounces and aborts in flight requests, so a person searching
 * hard produces a few requests a second at worst. Sixty in a rolling minute
 * leaves that untouched while capping what a script can extract from the one
 * endpoint on the site that reaches Postgres on every distinct term.
 */
const limiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SEARCH_SUGGEST_PER_MINUTE', 60),
  60_000,
)

/**
 * Results for the header's search drawer.
 *
 * The drawer needs to answer while someone is still typing, which a page
 * navigation cannot do. It reuses `searchPosts` rather than building a second
 * index, so the drawer and `/search` always agree — including the published
 * filter, which is what keeps drafts from surfacing here. Members-only pieces
 * are findable, as they are on the rest of the site; each result carries only
 * the title and excerpt.
 */
export async function GET(request: Request) {
  const allowance = limiter.check(clientKey(request.headers))
  if (!allowance.allowed) return tooManyRequests(allowance.resetAt)

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (!query) return NextResponse.json({ results: [] })

  const posts = await searchPosts(query, LIMIT)

  return NextResponse.json(
    {
      results: posts.map((post) => ({
        title: post.title,
        excerpt: post.excerpt,
        href: postPath(post.slug),
        tag: post.tags[0]?.name ?? null,
        readingTime: post.readingTime,
      })),
    },
    // Someone typing produces a request per keystroke against the same few
    // terms; a short shared cache absorbs that without going stale.
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } },
  )
}
