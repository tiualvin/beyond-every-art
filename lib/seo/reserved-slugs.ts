/**
 * Root path segments owned by application routes rather than migrated Ghost
 * posts/pages. Keeping the list here lets Payload validation and migration
 * preflight use exactly the same policy.
 *
 * Add a segment before introducing a new top-level route. Do not silently
 * rename migrated content: the migration report must surface the collision so
 * an editor can choose an explicit redirect and replacement slug.
 */
import { LOCALE_CODES } from '../i18n/locales'

export const RESERVED_ROOT_SLUGS = [
  // Not a route segment anyone browses, but a real one: the OAuth discovery
  // documents live under it, and a post that claimed this slug would shadow
  // them and quietly break every connector's ability to find the
  // authorization server.
  '.well-known',
  'admin',
  'api',
  'apps',
  'author',
  'csp-report',
  'health',
  // `app/icon.png` is a metadata file, not a page, but Next still answers
  // `/icon.png` from it — the same way `robots.txt` and `sitemap.xml` below
  // are answered from `app/robots.ts` and `app/sitemap.ts`. A file-based
  // root route is still a root route, so it reserves its segment here.
  'icon.png',
  // The IndexNow key file (`app/indexnow.txt/route.ts`). A post claiming it
  // would shadow the file and every submission would fail key verification.
  'indexnow.txt',
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

/**
 * Every configured locale code, English included, also owns its root segment:
 * `/es/…` is the Spanish site, so an English article whose slug is `es` would
 * sit exactly where the Spanish home page is. Kept apart from
 * `RESERVED_ROOT_SLUGS` because that list mirrors the app's static routes (and
 * a test holds it to them); these come from `lib/i18n/locales.ts`, so a
 * language added there is reserved here without anyone remembering to.
 *
 * `en` is reserved too although it is never a prefix: a post at `/en/` would
 * read to every crawler and reader as an English locale root.
 */
export const LOCALE_ROOT_SLUGS: readonly string[] = LOCALE_CODES

const reserved = new Set<string>([...RESERVED_ROOT_SLUGS, ...LOCALE_ROOT_SLUGS])
const localeRoots = new Set<string>(LOCALE_ROOT_SLUGS)

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
  if (localeRoots.has(normalized)) {
    return `The slug "${normalized}" is a language code: /${normalized}/ is where that language's edition of the site lives. Choose another slug.`
  }
  return `The slug "${normalized}" is reserved for an application route. Choose another slug and add an explicit redirect if this content previously used it.`
}

/**
 * Segments a translated article may not take under its language prefix,
 * because a route under `/{locale}/` already answers there: `/es/rss/` is the
 * Spanish feed and `/es/search/` the Spanish search page. `tag` and `author`
 * are listed too — their archives sit one level further down, but a Spanish
 * article at `/es/tag/` would read as a broken tag index.
 */
export const RESERVED_LOCALE_SLUGS = ['author', 'rss', 'search', 'tag'] as const

const reservedUnderLocale = new Set<string>(RESERVED_LOCALE_SLUGS)

/** Payload field validator for a post slug in a prefixed locale. */
export function validateLocalizedContentSlug(
  value: string | null | undefined,
): true | string {
  if (!value) return true
  const normalized = normalizeRootSlug(value)
  if (!reservedUnderLocale.has(normalized)) return true
  return `The slug "${normalized}" is used by a page under every language prefix (/es/${normalized}/ and so on). Choose another slug.`
}
