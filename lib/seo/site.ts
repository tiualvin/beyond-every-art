const DEFAULT_SITE_URL = 'http://localhost:3000'

/**
 * The public origin of the site, without a trailing slash. Prefers the
 * dedicated site URL, then the Next/Payload server URLs, and finally a
 * localhost fallback so build-time evaluation never throws.
 */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.PAYLOAD_PUBLIC_SERVER_URL ||
    DEFAULT_SITE_URL
  return raw.replace(/\/+$/, '')
}

/** Joins a path onto the site origin, passing absolute URLs through untouched. */
export function absoluteUrl(
  pathname: string,
  siteUrl: string = getSiteUrl(),
): string {
  if (/^https?:\/\//i.test(pathname)) return pathname
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${siteUrl}${path}`
}

// Content paths mirror the Ghost permalink structure (trailing slash) so that
// canonical, sitemap, and feed URLs preserve the pre-migration URLs and their
// accumulated SEO value.
export const postPath = (slug: string): string => `/${slug}/`
export const pagePath = (slug: string): string => `/${slug}/`
export const tagPath = (slug: string): string => `/tag/${slug}/`
export const authorPath = (slug: string): string => `/author/${slug}/`

/** Path of the RSS feed route (Ghost served this at `/rss/`). */
export const FEED_PATH = '/rss'

/**
 * Path of the journal archive — every published public post, newest first.
 *
 * No trailing slash. The content paths above keep theirs because they preserve
 * Ghost's permalinks; this route is new, has no pre-migration URL to protect,
 * and `/journal` is the URL Next.js actually serves, so navigation, canonical
 * tags, pagination, and the sitemap all agree without a redirect hop.
 */
export const JOURNAL_PATH = '/journal'

/** New publication routes deliberately follow the no-trailing-slash style. */
export const PUBLICATION_PATH = '/publication'
export const publicationPath = (slug: string): string =>
  `${PUBLICATION_PATH}/${slug}`
export const publicationReadPath = (slug: string): string =>
  `${publicationPath(slug)}/read`
export const publicationTranscriptPath = (slug: string): string =>
  `${publicationPath(slug)}/transcript`

/**
 * The apps the studio is building, and each app's own page.
 *
 * No trailing slash, matching the other post-migration routes: these are new
 * URLs with no Ghost permalink to preserve, so navigation, canonicals and the
 * sitemap can all agree on what Next.js actually serves.
 */
export const APPS_PATH = '/apps'
export const appPath = (slug: string): string => `${APPS_PATH}/${slug}`

/** Path of the search page. */
export const SEARCH_PATH = '/search/'

/** Path of the newsletter signup page. */
export const NEWSLETTER_PATH = '/newsletter/'
