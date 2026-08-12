import type { MetadataRoute } from 'next'

import { cachedRead, CONTENT_TAGS } from '@/lib/cache/content'
import { getPayloadClient } from '@/lib/payload'
import { getSiteUrl } from '@/lib/seo/site'
import { buildSitemapEntries, type SitemapDoc } from '@/lib/seo/sitemap'

// Rendered per request so canonical URLs, feeds and JSON-LD come from the
// running container's environment rather than the build's; the database reads
// behind it are cached and purged on publish (lib/cache/content.ts).
export const dynamic = 'force-dynamic'

type PublishedDoc = {
  slug?: string
  updatedAt?: string
  publishedAt?: string
}

function toDocs(docs: PublishedDoc[]): SitemapDoc[] {
  return docs
    .filter((doc): doc is PublishedDoc & { slug: string } => Boolean(doc.slug))
    .map((doc) => ({
      slug: doc.slug,
      updatedAt: doc.updatedAt ?? null,
      publishedAt: doc.publishedAt ?? null,
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
    const [posts, pages, tags, authors] = await Promise.all([
      payload.find({
        collection: 'posts',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        // Restricted posts have real, indexable URLs that serve a teaser, so
        // they are listed like any other published post.
        where: { _status: { equals: 'published' } },
        select: { slug: true, updatedAt: true, publishedAt: true },
      }),
      payload.find({
        collection: 'pages',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        where: { _status: { equals: 'published' } },
        select: { slug: true, updatedAt: true, publishedAt: true },
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
    ])

    return {
      posts: toDocs(posts.docs as PublishedDoc[]),
      pages: toDocs(pages.docs as PublishedDoc[]),
      tags: toDocs(tags.docs as PublishedDoc[]),
      authors: toDocs(authors.docs as PublishedDoc[]),
    }
  },
  [
    CONTENT_TAGS.posts,
    CONTENT_TAGS.pages,
    CONTENT_TAGS.tags,
    CONTENT_TAGS.authors,
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
