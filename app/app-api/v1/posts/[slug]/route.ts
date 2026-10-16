import { PostResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, notFound, respondWith } from '@/lib/app-api/http'
import { toPostDetail } from '@/lib/app-api/serialize'
import { getPostBySlug } from '@/lib/content/queries'
import {
  hasSlugMissAllowance,
  isLookupableSlug,
  spendSlugMiss,
} from '@/lib/security/slug-requests'

export const dynamic = 'force-dynamic'

/**
 * One live post, read through the same cached reader the article page uses:
 * `live()`, the teaser cut for a gated post and the withheld links all apply
 * exactly as they do on the website, and the body is then projected by
 * allow-list (lib/app-api/project.ts).
 *
 * The slug is checked before the database is asked, and a miss spends the same
 * allowance a page route's miss does (lib/security/slug-requests.ts).
 */
export const GET = appApiRoute<{ slug: string }>(async (request, { slug }) => {
  if (!isLookupableSlug(slug) || !hasSlugMissAllowance(request.headers)) {
    return notFound()
  }

  const post = await getPostBySlug(slug)
  if (!post) {
    spendSlugMiss(request.headers)
    return notFound()
  }

  return respondWith(PostResponseSchema, { post: toPostDetail(post) })
})
