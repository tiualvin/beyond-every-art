/**
 * Root path segments owned by application routes rather than migrated Ghost
 * posts/pages. Keeping the list here lets Payload validation and migration
 * preflight use exactly the same policy.
 *
 * Add a segment before introducing a new top-level route. Do not silently
 * rename migrated content: the migration report must surface the collision so
 * an editor can choose an explicit redirect and replacement slug.
 */
export const RESERVED_ROOT_SLUGS = [
  // Not a route segment anyone browses, but a real one: the OAuth discovery
  // documents live under it, and a post that claimed this slug would shadow
  // them and quietly break every connector's ability to find the
  // authorization server.
  '.well-known',
  'admin',
  // The authorized-sellers file, served by `app/ads.txt/route.ts`. A post that
  // claimed this slug would shadow it, and ad serving would stop on a site that
  // looked entirely healthy.
  'ads.txt',
  'api',
  'apps',
  'author',
  'csp-report',
  'health',
  'journal',
  'newsletter',
  'oauth',
  'publication',
  'redirects-map',
  'robots.txt',
  'rss',
  'search',
  'sitemap.xml',
  'tag',
  'webhooks',
] as const

const reserved = new Set<string>(RESERVED_ROOT_SLUGS)

/** Normalize the value in the same conservative way route matching does. */
export function normalizeRootSlug(value: string): string {
  return value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
}

export function isReservedRootSlug(value: string): boolean {
  return reserved.has(normalizeRootSlug(value))
}

/** Payload field validator shared by posts and pages. */
export function validateRootContentSlug(
  value: string | null | undefined,
): true | string {
  if (!value) return true
  const normalized = normalizeRootSlug(value)
  if (!reserved.has(normalized)) return true
  return `The slug "${normalized}" is reserved for an application route. Choose another slug and add an explicit redirect if this content previously used it.`
}
