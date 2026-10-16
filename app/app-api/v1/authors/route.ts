import { AuthorListResponseSchema } from '@/lib/app-api/contract'
import { appApiRoute, respondWith } from '@/lib/app-api/http'
import { toAuthorEntry } from '@/lib/app-api/serialize'
import { getAuthorsWithCounts } from '@/lib/content/queries'

export const dynamic = 'force-dynamic'

/** Authors with at least one live post, most published first. */
export const GET = appApiRoute(async () =>
  respondWith(AuthorListResponseSchema, {
    authors: (await getAuthorsWithCounts()).map(toAuthorEntry),
  }),
)
