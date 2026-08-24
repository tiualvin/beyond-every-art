import {
  absoluteUrl,
  appPath,
  APPS_PATH,
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
  /**
   * The document asks to stay out of search results.
   *
   * Only Posts and Pages carry the field; the archives do not have it, and a
   * caller that passes nothing gets the old behaviour.
   */
  noindex?: boolean | null
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
  apps = [],
}: {
  siteUrl: string
  posts?: readonly SitemapDoc[]
  pages?: readonly SitemapDoc[]
  tags?: readonly SitemapDoc[]
  authors?: readonly SitemapDoc[]
  apps?: readonly SitemapDoc[]
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

  // The apps overview is a route rather than a document. It is listed only
  // when an app has actually been published, so an empty /apps never enters
  // the index.
  if (apps.length > 0) {
    entries.push({
      url: absoluteUrl(APPS_PATH, siteUrl),
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  // A noindexed document is dropped rather than listed. A sitemap is a request
  // to index, so listing a URL whose own page says not to is a contradiction —
  // Search Console reports it as one, and the mixed signal is resolved in
  // whichever direction the crawler prefers rather than the one asked for.
  for (const post of posts) {
    if (!post.slug || post.noindex) continue
    entries.push({
      url: absoluteUrl(postPath(post.slug), siteUrl),
      lastModified: toIso(post.updatedAt) ?? toIso(post.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  for (const page of pages) {
    if (!page.slug || page.noindex) continue
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

  for (const app of apps) {
    if (!app.slug) continue
    entries.push({
      url: absoluteUrl(appPath(app.slug), siteUrl),
      lastModified: toIso(app.updatedAt) ?? toIso(app.publishedAt),
      changeFrequency: 'monthly',
      priority: 0.4,
    })
  }

  return entries
}
