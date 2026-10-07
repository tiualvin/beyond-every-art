// Reading publications for the public site.
//
// The same rules the apps are read with (`lib/content/queries.ts`): readers get
// published issues through a cached read that publishing purges, filtered by
// `live()` so a future publish date keeps an issue off the site until it
// arrives; an editor previewing gets the latest draft, read uncached and with
// their own access rather than the site's. The shapes come from `content.ts`.
//
// Whether any of this reaches a reader at all is decided by the routes, against
// `lib/publications/launch.ts`.

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { live } from '@/lib/content/schedule'
import { getPayloadClient } from '@/lib/payload'
import type { PreviewUser } from '@/lib/preview/session'

import {
  toPublicationCard,
  toPublicationDetail,
  type PublicationCard,
  type PublicationDetail,
  type RawPublication,
} from './content'

async function readPublications(): Promise<PublicationCard[]> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'publications',
      overrideAccess: true,
      depth: 1,
      pagination: false,
      limit: 0,
      sort: '-publishedAt',
      where: live(),
    })
    return (result.docs as RawPublication[])
      .map(toPublicationCard)
      .filter((issue): issue is PublicationCard => issue !== null)
  } catch {
    return []
  }
}

/** Live issues, newest first. Drafts and future-dated issues never appear. */
export const getPublications = cachedRead('publications', readPublications, [
  CONTENT_TAGS.publications,
  CONTENT_TAGS.media,
])

async function readPublicationBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PublicationDetail | null> {
  try {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'publications',
      // A draft read carries the editor's own access, the way pages do.
      overrideAccess: !options.draft,
      user: options.draft ? (options.user ?? undefined) : undefined,
      depth: 1,
      limit: 1,
      draft: options.draft,
      where: options.draft
        ? { slug: { equals: slug } }
        : { and: [{ slug: { equals: slug } }, live()] },
    })
    return toPublicationDetail(result.docs[0] as RawPublication | undefined)
  } catch {
    return null
  }
}

const getLivePublicationBySlug = cachedRead(
  'publication-by-slug',
  (slug: string) => readPublicationBySlug(slug),
  [CONTENT_TAGS.publications, CONTENT_TAGS.media],
)

/**
 * One issue by slug. Live only, unless a preview session asks for the draft —
 * in which case the read runs as that editor rather than cached.
 */
export function getPublicationBySlug(
  slug: string,
  options: { draft?: boolean; user?: PreviewUser | null } = {},
): Promise<PublicationDetail | null> {
  return options.draft
    ? readPublicationBySlug(slug, options)
    : getLivePublicationBySlug(slug)
}
