// What it costs a stranger to ask for a page that does not exist.
//
// Every slug route — `/<slug>`, `/tag/<slug>`, `/author/<slug>`,
// `/apps/<slug>` — reads its document through `cachedRead`, which is
// `unstable_cache` keyed on the slug. `lib/content/queries.ts` already states
// the invariant that makes that safe, in the note above `cachedSearchPosts`:
// the cache is keyed on attacker-controlled text, "which would be a way to fill
// it with junk if anything else did not bound it — the rate limiters on
// /search and /search/suggest are what make the number of distinct keys
// finite."
//
// The same property holds here and nothing bounded it. A walk through
// `/aaaa1`, `/aaaa2`, … never hits a cached entry, so each request was two
// Postgres queries (a post miss, then a page miss) and two new cache entries on
// disk, repeatable for as long as somebody cared to keep sending requests.
//
// Two bounds, in order of how little they cost:
//
//   1. **Shape.** `fields/slug.ts` validates every stored slug against
//      `SLUG_PATTERN`, so a slug that does not match that pattern cannot name a
//      document — the query is answerable without asking. This is the cheap
//      half and it catches most scanning traffic, which is full of dots,
//      slashes, encoded payloads and capitals.
//   2. **Volume.** A well-formed slug still has to be looked up, so those are
//      counted — but only when they *miss*. A reader moving through real
//      articles spends nothing here; a run of plausible-looking guesses spends
//      the allowance and is then answered 404 without a query at all.
//
// Counting failures rather than requests is what `FixedWindowRateLimiter.peek`
// exists for; see its own note. It is also why the allowance can be small
// without ever touching somebody reading the site.

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { isWellFormedSlug } from '../seo/slug-format'
import {
  clientKey,
  configuredLimit,
  FixedWindowRateLimiter,
} from './rate-limit'

/**
 * The longest slug that will ever be looked up.
 *
 * `SLUG_PATTERN` bounds the alphabet but not the length, so without this a
 * megabyte of hyphenated lowercase is still "well formed" and still reaches
 * Postgres. Ghost stored slugs in a 191-character column and the migrated
 * corpus is far under that, so this refuses only what could not have been
 * stored in the first place.
 */
export const MAX_SLUG_LENGTH = 200

/**
 * Whether a path segment could name a stored document at all.
 *
 * Deliberately the same rule `fields/slug.ts` enforces on write rather than a
 * second, looser one: a route that accepted more than the field does would be
 * looking up values the database cannot contain.
 */
export function isLookupableSlug(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    isWellFormedSlug(value)
  )
}

/**
 * Misses one source may spend per minute before slug lookups stop reaching the
 * database.
 *
 * Thirty is far above a person following stale bookmarks and far below anything
 * worth automating. Migrated Ghost URLs do not land here at all — `middleware.ts`
 * redirects them before a page route runs — so a 404 at this point means the
 * address is genuinely gone.
 *
 * Exported so the routes share one instance and the tests can drive it.
 */
export const slugMissLimiter = new FixedWindowRateLimiter(
  configuredLimit('RATE_LIMIT_SLUG_MISSES_PER_MINUTE', 30),
  60_000,
)

/** Whether this source has miss allowance left. Spends nothing; see `peek`. */
export function hasSlugMissAllowance(requestHeaders: Headers): boolean {
  return slugMissLimiter.peek(clientKey(requestHeaders)).allowed
}

/** Spend one miss against this source. */
export function spendSlugMiss(requestHeaders: Headers): void {
  slugMissLimiter.check(clientKey(requestHeaders))
}

/**
 * Answer 404 without a database read when the slug cannot resolve, or when this
 * source has spent its allowance of slugs that did not.
 *
 * Called at the top of the `cache()`d resolver each slug route already has, so
 * it runs once per request and covers `generateMetadata` and the page body
 * together.
 *
 * Preview is exempt at the call sites: a draft save relaxes field validation,
 * so an editor previewing unpublished work is the one case where a slug that
 * fails `isLookupableSlug` can legitimately be asked for — and an authenticated
 * editor is not the traffic this bounds.
 */
export async function requireLookupableSlug(slug: string): Promise<void> {
  if (!isLookupableSlug(slug)) notFound()
  if (!hasSlugMissAllowance(await headers())) notFound()
}

/**
 * Record a well-formed slug that resolved to nothing.
 *
 * Called only on a genuine miss, after the read. A hit records nothing, which
 * is the whole point: the allowance is spent by guessing, never by reading.
 */
export async function recordSlugMiss(): Promise<void> {
  spendSlugMiss(await headers())
}
