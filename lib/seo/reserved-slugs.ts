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
  'admin',
  'api',
  'author',
  'csp-report',
  'health',
  'journal',
  'newsletter',
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
