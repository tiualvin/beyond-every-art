// How one list of related posts is shared between the two places that show it.
//
// The rail is a desktop module: it is hidden below 1280 and it is supplementary
// by construction. "Read next" closes the article on every device. So the most
// relevant pieces go to "Read next" and the rail takes what follows, which also
// means a thin tag — one where the query had to top up with recent posts to
// fill three — spends its best matches where everyone sees them and simply
// leaves the rail empty.
//
// Splitting rather than querying twice keeps one cache entry and one ordering.
// `getRelatedPosts` already takes a limit and `cachedRead` keys on arguments,
// so asking for six costs the same round trip as asking for three.

import type { PostCard } from './queries'

/** What each surface shows when there are enough posts to fill both. */
export const READ_NEXT_COUNT = 3
export const RAIL_COUNT = 3

/** How many to ask `getRelatedPosts` for, so a split can fill both. */
export const RELATED_QUERY_LIMIT = READ_NEXT_COUNT + RAIL_COUNT

export type RelatedSplit = {
  readNext: PostCard[]
  rail: PostCard[]
}

export function splitRelated(posts: PostCard[]): RelatedSplit {
  return {
    readNext: posts.slice(0, READ_NEXT_COUNT),
    rail: posts.slice(READ_NEXT_COUNT, RELATED_QUERY_LIMIT),
  }
}
