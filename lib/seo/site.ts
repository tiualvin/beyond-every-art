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
