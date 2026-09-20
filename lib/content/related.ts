// How many related posts a post page asks for, and who shows them.
//
// Two surfaces now, where there was one, and where there were two before that.
// The history is worth keeping because the shape keeps coming back and the
// reasons are not the same each time.
//
// "Read next" closes the article on every device. The rail used to take a
// second helping of the same query and show it to desktop readers only, above
// the fold of a sticky group that could not hold it — so that module went, and
// `splitRelated` and `RAIL_COUNT` went with it, because a limit left at six
// would have been three rows read on every post render that nothing rendered.
//
// A split is back, for a surface that is not a second copy of the list. The
// in-body ad slots hold house content when no ad is served
// (`docs/ADVERTISING.md` §8), and unlike the rail's one box there are up to six
// of them down a long article. They take the *tail* of the pool, after the
// three "Read next" shows, so the two surfaces are disjoint by construction
// rather than by a dedupe pass — a reader never meets the same piece twice on
// one page, and no query knows about the other.

import { INLINE_MAX } from '@/lib/ads/inline'

/** What "Read next" shows, and therefore the head of the pool. */
export const READ_NEXT_COUNT = 3

/**
 * How many pieces the in-body house slots can consume.
 *
 * Derived from `INLINE_MAX` rather than written down, because the two numbers
 * are the same fact: every slot an article can carry is a slot that needs
 * something to show when Google declines it. Raising the unit cap without
 * raising this would leave the last units with a labelled empty box, which is
 * the defect the fallback exists to remove — and it would do it silently,
 * on the longest articles only.
 */
export const INLINE_PROMO_MAX = INLINE_MAX

/**
 * What the post page asks the database for: exactly what it renders.
 *
 * Nine rather than three. `readRelatedPosts` tops a thin tag match up with
 * recent posts, so this is what it returns on any archive with ten published
 * pieces; below that the tail runs short and the slots past it fall back to
 * showing nothing, which is what they did before this existed.
 */
export const RELATED_QUERY_LIMIT = READ_NEXT_COUNT + INLINE_PROMO_MAX

/**
 * The pool, divided between the two surfaces that show it.
 *
 * Generic over the item because the division is arithmetic about a list and
 * nothing here needs to know it is holding posts. Both halves come out in the
 * order the query returned them — newest first, tag matches before top-ups —
 * so "Read next" keeps showing the three most relevant pieces and the in-body
 * slots take what is left in the same order.
 */
export function splitRelated<T>(pool: T[]): { readNext: T[]; inline: T[] } {
  return {
    readNext: pool.slice(0, READ_NEXT_COUNT),
    inline: pool.slice(READ_NEXT_COUNT, RELATED_QUERY_LIMIT),
  }
}
