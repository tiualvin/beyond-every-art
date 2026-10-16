import { TagResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, notFound, respondWith } from '@/lib/app-api/http'
import { toPostSummary } from '@/lib/app-api/serialize'
import { mediaFromImage } from '@/lib/app-api/project'
import { getPostsByTag } from '@/lib/content/queries'
import {
  hasSlugMissAllowance,
  isLookupableSlug,
  spendSlugMiss,
} from '@/lib/security/slug-requests'
import { getSiteUrl } from '@/lib/seo/site'

export const dynamic = 'force-dynamic'

/** A tag and its live posts, as the tag archive reads them. */
export const GET = appApiRoute<{ slug: string }>(async (request, { slug }) => {
  if (!isLookupableSlug(slug) || !hasSlugMissAllowance(request.headers)) {
    return notFound()
  }

  const archive = await getPostsByTag(slug)
  if (!archive) {
    spendSlugMiss(request.headers)
    return notFound()
  }

  return respondWith(TagResponseSchema, {
    tag: {
      name: archive.name,
      slug: archive.slug,
      description: archive.description.trim() || null,
      image: archive.image ? mediaFromImage(archive.image, getSiteUrl()) : null,
    },
    posts: archive.posts.map(toPostSummary),
  })
})
