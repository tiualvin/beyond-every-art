import type { MetadataRoute } from 'next'

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { getPayloadClient } from '@/lib/payload'
import { getSiteUrl } from '@/lib/seo/site'
import {
  buildSitemapEntries,
  listableTags,
  type SitemapDoc,
} from '@/lib/seo/sitemap'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type PublishedDoc = {
  slug?: string
  updatedAt?: string
  publishedAt?: string
  /** Posts and Pages only; the archives have no such field to select. */
  noindex?: boolean
}

/** Tag rows keep their id, which `toDocs` drops and the count below needs. */
type TagDoc = PublishedDoc & { id: string | number }

function toDocs(docs: PublishedDoc[]): SitemapDoc[] {
  return docs
    .filter((doc): doc is PublishedDoc & { slug: string } => Boolean(doc.slug))
    .map((doc) => ({
      slug: doc.slug,
      updatedAt: doc.updatedAt ?? null,
      publishedAt: doc.publishedAt ?? null,
      noindex: doc.noindex ?? false,
    }))
}

/**
 * Every indexable slug, cached and purged with the content it lists.
 *
 * Only the URLs are cached, not the sitemap itself: the origin they hang off
 * comes from the running container's environment, which cutover changes
 * without a rebuild.
 */
const readSlugs = cachedRead(
  'sitemap-slugs',
  async () => {
    const payload = await getPayloadClient()
    const [posts, pages, tags, authors, apps] = await Promise.all([
      payload.find({
        collection: 'posts',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        // Restricted posts have real, indexable URLs that serve a teaser, so
        // they are listed like any other published post.
        where: { _status: { equals: 'published' } },
        // `noindex` is selected rather than filtered on in the query: the
        // column is null for every document written before the field existed,
        // and a `not_equals: true` filter would have to be trusted to treat
        // null as "not true" identically in every adapter. The exclusion is
        // decided in `buildSitemapEntries`, where it is unit tested.
        select: {
          slug: true,
          updatedAt: true,
          publishedAt: true,
          noindex: true,
        },
      }),
      payload.find({
        collection: 'pages',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        where: { _status: { equals: 'published' } },
        select: {
          slug: true,
          updatedAt: true,
          publishedAt: true,
          noindex: true,
        },
      }),
      payload.find({
        collection: 'tags',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'authors',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'apps',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        where: { _status: { equals: 'published' } },
        select: { slug: true, updatedAt: true },
      }),
    ])

    // Only tags with published posts behind them. Counted per tag rather than
    // read off the posts, which is what `readTagsWithCounts` does for the topic
    // chips — the same question, already answered correctly against this data
    // in production, so this does not rest on assumptions about what a
    // relationship `select` returns. It is one query per tag, on a read that is
    // cached and purged on publish. See `listableTags` for the rule and why it
    // refuses to empty the section.
    const tagDocs = tags.docs as TagDoc[]
    const counted = await Promise.all(
      tagDocs.map(async (tag) => ({
        tag,
        publishedPosts: (
          await payload.count({
            collection: 'posts',
            overrideAccess: true,
            where: {
              and: [
                { tags: { in: [tag.id] } },
                { _status: { equals: 'published' } },
              ],
            },
          })
        ).totalDocs,
      })),
    )
    const listedTags = listableTags(counted)

    return {
      posts: toDocs(posts.docs as PublishedDoc[]),
      pages: toDocs(pages.docs as PublishedDoc[]),
      tags: toDocs(listedTags),
      authors: toDocs(authors.docs as PublishedDoc[]),
      apps: toDocs(apps.docs as PublishedDoc[]),
    }
  },
  [
    CONTENT_TAGS.posts,
    CONTENT_TAGS.pages,
    CONTENT_TAGS.tags,
    CONTENT_TAGS.authors,
    CONTENT_TAGS.apps,
  ],
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()

  try {
    return buildSitemapEntries({ siteUrl, ...(await readSlugs()) })
  } catch {
    // If the database is unavailable (e.g. during a build), still emit a valid
    // sitemap containing the homepage rather than failing the route.
    return buildSitemapEntries({ siteUrl })
  }
}
