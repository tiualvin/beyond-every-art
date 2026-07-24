import { absoluteUrl, pagePath, postPath } from './site'

export type SitemapDoc = {
  slug: string
  updatedAt?: string | Date | null
  publishedAt?: string | Date | null
}

export type SitemapEntry = {
  url: string
  lastModified?: string
  changeFrequency?:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/**
 * Builds sitemap entries for the homepage plus published posts and pages. Pure
 * so it can be unit tested; the route pulls the documents from Payload and hands
 * them here for URL construction.
 */
export function buildSitemapEntries({
  siteUrl,
  posts = [],
  pages = [],
}: {
  siteUrl: string
  posts?: readonly SitemapDoc[]
  pages?: readonly SitemapDoc[]
}): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
  ]

  for (const post of posts) {
    if (!post.slug) continue
    entries.push({
      url: absoluteUrl(postPath(post.slug), siteUrl),
      lastModified: toIso(post.updatedAt) ?? toIso(post.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  for (const page of pages) {
    if (!page.slug) continue
    entries.push({
      url: absoluteUrl(pagePath(page.slug), siteUrl),
      lastModified: toIso(page.updatedAt) ?? toIso(page.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    })
  }

  return entries
}
