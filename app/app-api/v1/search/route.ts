import { SearchResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, respondWith, searchLimiter } from '@/lib/app-api/http'
import { toPostSummary } from '@/lib/app-api/serialize'
import { normaliseSearchTerm, searchPosts } from '@/lib/content/queries'

export const dynamic = 'force-dynamic'

/** How many results one search returns. The website's search page shows as many. */
const LIMIT = 20

/**
 * Live posts whose title or standfirst matches, through the website's own
 * search — normalised, length-capped and cached the same way — and under its
 * own, tighter limit.
 */
export const GET = appApiRoute(
  async (request) => {
    const term = normaliseSearchTerm(
      new URL(request.url).searchParams.get('q') ?? '',
    )
    if (!term)
      return respondWith(SearchResponseSchema, { query: '', posts: [] })

    return respondWith(SearchResponseSchema, {
      query: term,
      posts: (await searchPosts(term, LIMIT)).map(toPostSummary),
    })
  },
  { limiter: searchLimiter },
)
