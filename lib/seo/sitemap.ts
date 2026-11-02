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
  /**
   * The document's own images — site-relative paths or absolute URLs.
   *
   * A document with no featured image passes nothing and gets no `images` key,
   * which is what every entry did before this existed. Only the kinds that
   * render an image carry one: posts, pages and apps. Tag and author archives
   * have a field for a featured image and none set, so they are not passed.
   */
  images?: readonly string[] | null
}

export type SitemapEntry = {
  url: string
  lastModified?: string
  changeFrequency?:
    'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  /**
   * Image URLs for the entry's `<image:image>` tags.
   *
   * Next emits one per string. Kept absolute because a sitemap is fetched from
   * outside the site, where a root-relative path names nothing.
   */
  images?: string[]
}

/**
 * The image URLs an entry should advertise: absolute, deduped, in order.
 *
 * Blank values are dropped rather than turned into the page's own URL, which is
 * what `absoluteUrl('')` would do — an image location equal to the page is a
 * wrong answer that looks like a deliberate one.
 */
function toImageUrls(
  images: readonly string[] | null | undefined,
  siteUrl: string,
): string[] {
  const seen = new Set<string>()
  const urls: string[] = []

  for (const image of images ?? []) {
    const trimmed = typeof image === 'string' ? image.trim() : ''
    if (!trimmed) continue

    const url = absoluteUrl(trimmed, siteUrl)
    if (seen.has(url)) continue
    seen.add(url)
    urls.push(url)
  }

  return urls
}

/** The entry with its image list attached, when it has one. */
function withImages(
  entry: SitemapEntry,
  doc: SitemapDoc,
  siteUrl: string,
): SitemapEntry {
  const images = toImageUrls(doc.images, siteUrl)
  return images.length > 0 ? { ...entry, images } : entry
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/**
 * The tags whose archives belong in the sitemap: the ones with at least one
 * published post behind them.
 *
 * Ghost only ever published a tag archive that had posts in it — an empty one
 * 404s there. Payload has no such rule, and `news` — imported with the other
 * nine Ghost tags and never filed against anything — became a 200 page reading
 * "Nothing filed under this topic yet", listed in the sitemap and offered to
 * Google as a URL the old site never had. That is where the 10-against-9 tag
 * count in `MIGRATION_REHEARSAL.md` came from. `getTagsWithCounts` already
 * applies this rule to the topic chips, which is why the empty tag was linked
 * from nowhere and showed up only here.
 *
 * The fallback is the important half. Counts come from the database, and if
 * they ever all come back zero — a query that stops matching, a relationship
 * that stops resolving — the filter would remove every tag archive from the
 * sitemap. Nine real URLs lost is a far worse outcome than the one thin URL
 * this exists to drop, so a filter that removes *everything* is treated as a
 * broken filter rather than as an answer.
 */
export function listableTags<T>(
  counted: readonly { tag: T; publishedPosts: number }[],
): T[] {
  const kept = counted.filter((row) => row.publishedPosts > 0)
  const rows = kept.length === 0 && counted.length > 0 ? counted : kept
  return rows.map((row) => row.tag)
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
    entries.push(
      withImages(
        {
          url: absoluteUrl(postPath(post.slug), siteUrl),
          lastModified: toIso(post.updatedAt) ?? toIso(post.publishedAt),
          changeFrequency: 'weekly',
          priority: 0.7,
        },
        post,
        siteUrl,
      ),
    )
  }

  for (const page of pages) {
    if (!page.slug || page.noindex) continue
    entries.push(
      withImages(
        {
          url: absoluteUrl(pagePath(page.slug), siteUrl),
          lastModified: toIso(page.updatedAt) ?? toIso(page.publishedAt),
          changeFrequency: 'monthly',
          priority: 0.5,
        },
        page,
        siteUrl,
      ),
    )
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
    entries.push(
      withImages(
        {
          url: absoluteUrl(appPath(app.slug), siteUrl),
          lastModified: toIso(app.updatedAt) ?? toIso(app.publishedAt),
          changeFrequency: 'monthly',
          priority: 0.4,
        },
        app,
        siteUrl,
      ),
    )
  }

  return entries
}
