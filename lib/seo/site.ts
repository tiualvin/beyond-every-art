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

/**
 * Whether a site URL is one the public internet can actually fetch: https, on
 * a named host, and neither loopback nor a bare address.
 *
 * Named once because independent features have to agree on it and they fail
 * the same way when they do not. A development machine with a copied `.env`
 * otherwise announces URLs nobody can fetch (IndexNow, `indexNowConfig`) and
 * loads real ad code against a page Google logs as `127.0.0.1` (AdSense,
 * `resolveAdsenseClient`) — the tag reports the page it ran on, so the address
 * AdSense records as the property is the one the page was served from.
 *
 * The clauses reject, in order: plain http, `localhost`, an unqualified name
 * (`cms`, `postgres`), a bare IPv4 literal, and anything carrying a colon —
 * which is what an IPv6 literal (`[::1]`) looks like once `URL` has parsed it.
 */
export function isPublicSiteUrl(siteUrl: string): boolean {
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.hostname === 'localhost' || !url.hostname.includes('.')) return false
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return false
  return true
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

/**
 * Where Payload serves every upload: `/api/media/file/<filename>`.
 *
 * Named once because three things have to agree on it — the robots rule that
 * lets crawlers fetch images under an otherwise disallowed `/api`, the
 * Caddyfile exception that serves them on the public hostname, and the image
 * optimizer's allowlist (`lib/security/images.ts`). `tests/seo/robots.test.ts`
 * checks all three against this.
 */
export const MEDIA_FILE_PATH = '/api/media/file/'

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

/**
 * The id of the homepage's topics section, which is where "Topics" in the
 * navigation goes. There is no `/topics` route; the archive of topics is a
 * section of the homepage, and naming the anchor once keeps the link and the
 * section from drifting apart.
 */
export const HOME_TOPICS_ID = 'topics'
