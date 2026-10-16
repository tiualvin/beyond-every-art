import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PostListResponseSchema,
} from '@/lib/app-api/contract'
import {
  appApiRoute,
  badRequest,
  positiveInteger,
  respondWith,
} from '@/lib/app-api/http'
import { toPostSummary } from '@/lib/app-api/serialize'
import { getPublishedPosts } from '@/lib/content/queries'

// The companion app's content API (docs/COMPANION_APP.md). Off unless
// APP_API_ENABLED=1; see lib/app-api/http.ts.
export const dynamic = 'force-dynamic'

/** Far past the archive's end at any page size, and a bound on cache keys. */
const MAX_PAGE = 1000

/** Live posts, newest first, a page at a time. `limit` is capped, not refused. */
export const GET = appApiRoute(async (request) => {
  const query = new URL(request.url).searchParams
  const page = positiveInteger(query.get('page'), 1)
  const limit = positiveInteger(query.get('limit'), DEFAULT_PAGE_SIZE)
  if (page === null || limit === null || page > MAX_PAGE) {
    return badRequest('page and limit must be positive integers')
  }

  const pageSize = Math.min(limit, MAX_PAGE_SIZE)
  const result = await getPublishedPosts({ page, limit: pageSize })

  return respondWith(PostListResponseSchema, {
    posts: result.posts.map(toPostSummary),
    page,
    pageSize,
    totalPages: result.totalPages,
    totalPosts: result.totalPosts,
  })
})
