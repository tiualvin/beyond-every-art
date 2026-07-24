import type { MetadataRoute } from 'next'

import { getPayloadClient } from '@/lib/payload'
import { getSiteUrl } from '@/lib/seo/site'
import { buildSitemapEntries, type SitemapDoc } from '@/lib/seo/sitemap'

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()

  try {
    const payload = await getPayloadClient()
    const [posts, pages] = await Promise.all([
      payload.find({
        collection: 'posts',
        overrideAccess: true,
        depth: 0,
        pagination: false,
        limit: 0,
        where: {
          and: [
            { _status: { equals: 'published' } },
            { visibility: { equals: 'public' } },
          ],
        },
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
    ])

    return buildSitemapEntries({
      siteUrl,
      posts: toDocs(posts.docs as PublishedDoc[]),
      pages: toDocs(pages.docs as PublishedDoc[]),
    })
  } catch {
    // If the database is unavailable (e.g. during a build), still emit a valid
    // sitemap containing the homepage rather than failing the route.
    return buildSitemapEntries({ siteUrl })
  }
}
