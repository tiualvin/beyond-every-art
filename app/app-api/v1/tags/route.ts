import { TagListResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, respondWith } from '@/lib/app-api/http'
import { toTopic } from '@/lib/app-api/serialize'
import { getTagsWithCounts } from '@/lib/content/queries'

export const dynamic = 'force-dynamic'

/** Subjects with at least one live post, largest first: the homepage's topics. */
export const GET = appApiRoute(async () =>
  respondWith(TagListResponseSchema, {
    tags: (await getTagsWithCounts()).map(toTopic),
  }),
)
