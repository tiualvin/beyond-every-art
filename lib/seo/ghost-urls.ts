/**
 * The Ghost URL shapes this site does not serve, and where each one should go.
 *
 * The migration preserves permalinks — `/{slug}/`, `/tag/{slug}/`,
 * `/author/{slug}/` all serve directly, which is the whole point of
 * `trailingSlash: true`. Pagination is the exception, and it is invisible until
 * after cutover: Ghost paginates in the **path** (`/page/2/`,
 * `/tag/x/page/2/`), this site paginates in the **query string**
 * (`/journal/?page=2`). Nothing in the redirects export covers it, because
 * Ghost never needed a redirect for a URL it served itself.
 *
 * With 117 posts every one of those pagination URLs exists on the live Ghost
 * site today, is linked from its own archive pages, and is therefore crawled.
 * Left alone they become 404s on the day of the switch — a class of error that
 * shows up in Search Console weeks later, attributed to the migration.
 *
 * These are built in rather than imported as rows because they are derived from
 * the two URL schemes, not from anything an editor decided: there is no export
 * to read them from, and a hand-maintained row per page number goes stale the
 * next time a post is published. The `redirects` collection still wins — see
 * `middleware.ts` — so any of these can be overridden from the admin panel.
 */

import type { ResolvedRedirect } from './redirects'
import { JOURNAL_PATH } from './site'

/**
 * Path prefixes that are routes in their own right, so `/{first}/{second}/`
 * is not a post slug followed by something.
 *
 * `tag` and `author` are here so `/tag/page/2/` is read as the tag archive's
 * second page rather than as a tag named `page`.
 */
const RESERVED_PREFIXES = new Set([
  'apps',
  'author',
  'journal',
  'newsletter',
  'publication',
  'search',
  'tag',
])

/** `/page/2/` and friends: a positive integer, no leading zeros. */
const PAGE_NUMBER = /^[1-9][0-9]*$/

function segments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/**
 * Where a legacy Ghost URL should go, or `null` if this site already serves it.
 *
 * Every match is a 301. These URLs are gone permanently — the site paginates
 * somewhere else now — and only a permanent redirect passes the accumulated
 * ranking signal on to the destination.
 *
 * Pagination collapses to the **unpaginated** archive rather than to the
 * equivalent `?page=N`. Two reasons, and the second is a real bug rather than a
 * preference:
 *
 *   - Ghost's page size and this site's are different numbers, so "page 2"
 *     does not name the same posts on both sides. There is nothing to preserve.
 *   - `/journal/` calls `notFound()` for a page past the end of the archive, so
 *     mapping `/page/40/` to `/journal/?page=40` would turn one 404 into a
 *     redirect to another 404 — worse than leaving it alone, because a crawler
 *     now records a permanent redirect to a dead URL.
 */
export function legacyGhostRedirect(pathname: string): ResolvedRedirect | null {
  const parts = segments(pathname)
  if (parts.length < 2) return null

  const last = parts[parts.length - 1]!
  const marker = parts[parts.length - 2]!
  if (marker !== 'page' || !PAGE_NUMBER.test(last)) return null

  const base = parts.slice(0, -2)

  // `/page/2/` — the home collection's pagination. The archive that lists
  // every published post is the journal, not the homepage, which shows a fixed
  // handful.
  if (base.length === 0) {
    return { destination: JOURNAL_PATH, statusCode: 301 }
  }

  // `/tag/x/page/2/` and `/author/x/page/2/`. Both archives list the whole set
  // on one page here, so the base path is the complete answer.
  if (
    base.length === 2 &&
    (base[0] === 'tag' || base[0] === 'author') &&
    !RESERVED_PREFIXES.has(base[1]!)
  ) {
    return { destination: `/${base[0]}/${base[1]}/`, statusCode: 301 }
  }

  // `/journal/page/2/` — never a Ghost URL, but the shape a reader guesses.
  if (base.length === 1 && base[0] === 'journal') {
    return { destination: JOURNAL_PATH, statusCode: 301 }
  }

  return null
}

/**
 * The legacy shapes worth probing after cutover, given the slugs that exist.
 *
 * Used by `pnpm validate:redirects` to check the built-in rules on the running
 * site rather than only in a unit test — the matcher, the middleware order, and
 * the proxy in front of them are all things a unit test cannot see.
 */
export function legacyProbePaths({
  tagSlugs = [],
  authorSlugs = [],
}: {
  tagSlugs?: readonly string[]
  authorSlugs?: readonly string[]
} = {}): string[] {
  return [
    '/page/2/',
    '/page/3/',
    ...tagSlugs.map((slug) => `/tag/${slug}/page/2/`),
    ...authorSlugs.map((slug) => `/author/${slug}/page/2/`),
  ]
}
