import { AuthorResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, notFound, respondWith } from '@/lib/app-api/http'
import { toPostSummary } from '@/lib/app-api/serialize'
import { getPostsByAuthor } from '@/lib/content/queries'
import {
  hasSlugMissAllowance,
  isLookupableSlug,
  spendSlugMiss,
} from '@/lib/security/slug-requests'

export const dynamic = 'force-dynamic'

/** An author and their live posts, as the author archive reads them. */
export const GET = appApiRoute<{ slug: string }>(async (request, { slug }) => {
  if (!isLookupableSlug(slug) || !hasSlugMissAllowance(request.headers)) {
    return notFound()
  }

  const archive = await getPostsByAuthor(slug)
  if (!archive) {
    spendSlugMiss(request.headers)
    return notFound()
  }

  return respondWith(AuthorResponseSchema, {
    // The archive carries the author's bio as its description; the portrait
    // lives on the author record, which this reader does not return.
    author: {
      name: archive.name,
      slug: archive.slug,
      bio: archive.description.trim() || null,
      image: null,
    },
    posts: archive.posts.map(toPostSummary),
  })
})
