// When a document is actually public, as opposed to merely marked published.
//
// Two separate faults lived in the gap between those words, and both were
// invisible during the migration because every imported document arrived from
// Ghost with a real date already on it.
//
// **A future date did nothing.** `publishedAt` is the date a reader sees and
// the key every listing sorts on, but nothing consulted it when deciding what
// to serve. Setting it to next Tuesday and pressing Publish put the article on
// the site immediately, stamped with a date that had not happened yet — so the
// obvious way to schedule a piece was also the way to publish it early and
// date it wrong.
//
// **A missing date sorted first.** Postgres orders nulls first on a descending
// sort. `Posts.defaultSort` relies on that deliberately, to float drafts to the
// top of the admin list — but the public site sorts `-publishedAt` too, so a
// published article with no date does not merely appear undated, it pins itself
// above every dated article in the archive, the homepage and every tag page,
// permanently. `stampPublishedAt` in `publish-date.ts` is what stops that
// happening again; this file is what stops it being *hidden* in the meantime.
//
// Hence the shape of `notScheduled` below: a missing date is treated as public,
// never as withheld. Refusing to serve a dateless document would turn a
// cosmetic ordering fault into a live article disappearing from the site, which
// is the more expensive of the two by a wide margin. The admin dashboard
// reports those documents instead, so somebody can give them a date.

import type { Where } from 'payload'

import { DEFAULT_LOCALE } from '../i18n/locales'

/** The collections that carry a publication date. `apps` do not. */
export const SCHEDULABLE_COLLECTIONS = [
  'posts',
  'pages',
  'publications',
] as const

/**
 * The `_status` half, on its own.
 *
 * Every published post, whatever its visibility. Members-only and
 * subscriber-only posts are listed, searched, syndicated and routed exactly
 * like public ones; what changes is how much of the body a reader is given.
 * Filtering them out here instead is what made them vanish from the site after
 * the Ghost import, taking their URLs and rankings with them.
 */
export const publishedStatus: Where = { _status: { equals: 'published' } }

/**
 * Documents whose publication moment has arrived, or that never named one.
 *
 * Built per call rather than held in a module constant: a constant would freeze
 * "now" at the moment the server booted, so a long-running container would go
 * on withholding a post for as long as it had been up.
 */
export function notScheduled(now: Date = new Date()): Where {
  return {
    or: [
      { publishedAt: { less_than_equal: now.toISOString() } },
      { publishedAt: { exists: false } },
    ],
  }
}

/**
 * What the public site may serve from a collection that carries a date.
 *
 * Callers that already have their own conditions should spread this into their
 * own `and`, rather than nesting — Payload flattens either, but a reader of the
 * query should be able to see every condition at one level.
 */
export function live(now: Date = new Date()): Where {
  return { and: [publishedStatus, notScheduled(now)] }
}

/**
 * Whether a document is published but not yet due.
 *
 * The admin's counterpart to the query above: the edit view and the dashboard
 * say "Scheduled" where this is true, so an editor who set a future date can
 * tell that the article is waiting rather than missing.
 */
export function isScheduled(
  status: unknown,
  publishedAt: unknown,
  now: Date = new Date(),
): boolean {
  if (status !== 'published') return false
  if (typeof publishedAt !== 'string' || !publishedAt) return false
  const at = Date.parse(publishedAt)
  return Number.isFinite(at) && at > now.getTime()
}

/**
 * How long a scheduled document can sit past its moment before it appears.
 *
 * Nothing wakes up to publish it. The queries above simply stop excluding it,
 * which a visitor sees only once the cached read behind the page expires — so
 * the honest ceiling is `CONTENT_TTL_SECONDS`, and an editor scheduling to the
 * minute should know the site is not promising the minute. Stated here as a
 * number so the admin can say it in words rather than leaving it folklore.
 */
export { CONTENT_TTL_SECONDS as SCHEDULE_GRANULARITY_SECONDS } from '../cache/ttl'

/**
 * The translation's own half of "on the site": its status published and its
 * date arrived. Evaluated in the locale the query is made in — Payload reads a
 * localized field from that locale's row — so it only means anything inside a
 * query that passes `locale`.
 *
 * Unlike English, a translation with no date is not treated as live. The
 * dateless case above is a fault inherited from a migration; a translation is
 * always published through a hook that stamps its date (`stampLocaleDates`),
 * so a missing one is a write that went round it, and withholding is safe.
 */
export function translationLive(now: Date = new Date()): Where[] {
  return [
    { translationStatus: { equals: 'published' } },
    { translationPublishedAt: { less_than_equal: now.toISOString() } },
  ]
}

/**
 * What the public site may serve in `locale`. English is `live()` exactly;
 * a translation is that *and* its own status and date — a translation of an
 * article whose English is withdrawn or still scheduled is not served either,
 * because every translated page names the English URL as `x-default`.
 */
export function liveIn(locale: string, now: Date = new Date()): Where {
  if (locale === DEFAULT_LOCALE) return live(now)
  return { and: [publishedStatus, notScheduled(now), ...translationLive(now)] }
}
