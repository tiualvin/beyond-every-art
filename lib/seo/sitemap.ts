import {
  absoluteUrl,
  authorPath,
  JOURNAL_PATH,
  pagePath,
  postPath,
  tagPath,
} from './site'

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
 * Builds sitemap entries for the homepage and journal archive, plus published
 * posts and pages. Pure so it can be unit tested; the route pulls the documents
 * from Payload and hands them here for URL construction.
 */
export function buildSitemapEntries({
  siteUrl,
  posts = [],
  pages = [],
  tags = [],
  authors = [],
}: {
  siteUrl: string
  posts?: readonly SitemapDoc[]
  pages?: readonly SitemapDoc[]
  tags?: readonly SitemapDoc[]
  authors?: readonly SitemapDoc[]
}): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { url: `${siteUrl}/`, changeFrequency: 'daily', priority: 1 },
    // The archive is a route rather than a document, so it has no lastModified
    // of its own. Only page one is listed; deeper pages are reachable from it.
    {
      url: absoluteUrl(JOURNAL_PATH, siteUrl),
      changeFrequency: 'daily',
      priority: 0.8,
    },
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

  for (const tag of tags) {
    if (!tag.slug) continue
    entries.push({
      url: absoluteUrl(tagPath(tag.slug), siteUrl),
      lastModified: toIso(tag.updatedAt) ?? toIso(tag.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.4,
    })
  }

  for (const author of authors) {
    if (!author.slug) continue
    entries.push({
      url: absoluteUrl(authorPath(author.slug), siteUrl),
      lastModified: toIso(author.updatedAt) ?? toIso(author.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.3,
    })
  }

  return entries
}
