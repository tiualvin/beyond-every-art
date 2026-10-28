import type { MetadataRoute } from 'next'

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { normalizeMediaUrl } from '@/lib/content/media'
import { live } from '@/lib/content/schedule'
import { getPayloadClient } from '@/lib/payload'
import { getSiteUrl } from '@/lib/seo/site'
import {
  buildSitemapEntries,
  listableTags,
  type SitemapDoc,
} from '@/lib/seo/sitemap'
import {
  postImagePaths,
  postMediaIds,
  type PostImageSource,
} from '@/lib/seo/sitemap-images'

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
  /** Posts only: image paths from `postImagePaths`. */
  images?: string[]
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
      ...(doc.images ? { images: doc.images } : {}),
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
        // they are listed like any other published post. A *scheduled* one is
        // not: `live()` withholds it until its date arrives, and offering a
        // crawler a URL that 404s is worse than offering it late.
        where: live(),
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
          // For the image entries: `postImagePaths` decides from these which
          // pictures each post's page shows. Depth 0, so uploads are ids and
          // one Media query below resolves them all.
          featuredImage: true,
          content: true,
          legacyHTML: true,
          visibility: true,
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
              and: [{ tags: { in: [tag.id] } }, live()],
            },
          })
        ).totalDocs,
      })),
    )
    const listedTags = listableTags(counted)

    // Every Media id any post's entry names, resolved in one query. Trashed
    // records are left out by `find`, so a deleted image is never listed.
    const postDocs = posts.docs as Array<PublishedDoc & PostImageSource>
    const mediaIds = [...new Set(postDocs.flatMap(postMediaIds))]
    const media = mediaIds.length
      ? await payload.find({
          collection: 'media',
          overrideAccess: true,
          depth: 0,
          pagination: false,
          limit: 0,
          where: { id: { in: mediaIds } },
          // `filename` is not read here, but `url` is built from it after the
          // read: selected alone, every `url` comes back null.
          select: { url: true, filename: true },
        })
      : { docs: [] }
    const urls = new Map(
      (media.docs as Array<{ id: unknown; url?: unknown }>)
        .filter((doc) => typeof doc.url === 'string' && doc.url)
        .map((doc) => [String(doc.id), normalizeMediaUrl(doc.url as string)]),
    )

    return {
      posts: toDocs(
        postDocs.map((post) => ({
          ...post,
          images: postImagePaths(post, urls),
        })),
      ),
      pages: toDocs(pages.docs as PublishedDoc[]),
      tags: toDocs(listedTags),
      authors: toDocs(authors.docs as PublishedDoc[]),
      apps: toDocs(apps.docs as PublishedDoc[]),
    }
  },
  [
    CONTENT_TAGS.posts,
    CONTENT_TAGS.media,
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
