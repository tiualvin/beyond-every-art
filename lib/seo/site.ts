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

/** Path of the RSS feed route, as Ghost served it. */
export const FEED_PATH = '/rss/'

/**
 * Path of the journal archive — every published public post, newest first.
 *
 * Trailing slash, like everything else. This route is new and has no Ghost
 * permalink to protect, but `trailingSlash: true` in `next.config.ts` means the
 * slashed form is what Next.js serves, and an advertised URL that redirects is
 * the thing that configuration exists to stop.
 */
export const JOURNAL_PATH = '/journal/'

/** New publication routes, slashed to match what Next.js serves. */
export const PUBLICATION_PATH = '/publication/'
export const publicationPath = (slug: string): string =>
  `${PUBLICATION_PATH}${slug}/`
export const publicationReadPath = (slug: string): string =>
  `${publicationPath(slug)}read/`
export const publicationTranscriptPath = (slug: string): string =>
  `${publicationPath(slug)}transcript/`

/**
 * The apps the studio is building, and each app's own page. Slashed for the
 * same reason as the journal above: it is what Next.js serves.
 */
export const APPS_PATH = '/apps/'
export const appPath = (slug: string): string => `${APPS_PATH}${slug}/`

/** Path of the search page. */
export const SEARCH_PATH = '/search/'

/** Path of the newsletter signup page. */
export const NEWSLETTER_PATH = '/newsletter/'
