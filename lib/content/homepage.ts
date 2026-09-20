// What fills the homepage's "Editors' picks", and in what order.
//
// The section has claimed to be edited since the redesign and has been
// reverse-chronological the whole time: the page asked for seven recent posts,
// dropped the newest into the Latest band, and rendered the other six. Nothing
// an editor could do changed it. `Posts.featured` came across from Ghost, is
// read into `PostCard.featured`, and was consumed by nothing.
//
// Three tiers, most deliberate first, because each answers a different question
// and only the first one is a real editorial statement:
//
//   1. an explicit, ordered list — an editor naming these pieces, in this order
//   2. `Posts.featured` — an editor having flagged a piece at some point
//   3. recency — nobody having said anything
//
// Tier 1 has no field behind it yet. The chain is built now because tier 2
// alone is not a curation model: a flag with no order and no expiry says "this
// was worth featuring once", which is a weaker claim than the section makes.
// When the field lands, this function does not change.

import type { PostCard } from './queries'

/** How many rows "Editors' picks" holds. Six, as the section has always shown. */
export const PICK_SLOTS = 6

/**
 * How many of those slots the `featured` flag may take.
 *
 * All nine flagged posts in the live archive were published between 25 October
 * and 2 November 2025 — the oldest content on the site — because the flag was
 * last used in Ghost and nothing has touched it since. Letting the tier fill
 * every slot would leave a live homepage showing nothing from 2026 except the
 * Latest band, which trades one wrong page for another.
 *
 * Three is enough for the curation to be visible and leaves the page current.
 * It binds the flag only: an explicit list is uncapped, because an editor who
 * names six pieces means six.
 */
export const FEATURED_SLOTS = 3

export type PickTiers = {
  /** An editor's own ordered choice. Uncapped. No field feeds this yet. */
  curated?: readonly PostCard[]
  /** Posts flagged `featured`, newest first. Capped at `FEATURED_SLOTS`. */
  featured?: readonly PostCard[]
  /** Reverse-chronological top-up for whatever the tiers above leave. */
  recent?: readonly PostCard[]
  /** Ids already shown elsewhere on the page — the Latest band's piece. */
  exclude?: readonly string[]
}

/**
 * The picks, in tier order, deduplicated, capped at `PICK_SLOTS`.
 *
 * A piece appears once however many tiers claim it, and the earliest tier wins
 * its position — so flagging the newest post does not push it down the list, it
 * lifts it out of the recency tail.
 *
 * With no curated list and no flags this returns exactly what the page rendered
 * before: recency, minus whatever the Latest band already holds.
 */
export function selectPicks(tiers: PickTiers): PostCard[] {
  const seen = new Set(tiers.exclude ?? [])
  const picks: PostCard[] = []

  const take = (posts: readonly PostCard[] | undefined, limit: number) => {
    if (!posts) return
    let taken = 0
    for (const post of posts) {
      if (picks.length >= PICK_SLOTS || taken >= limit) return
      if (seen.has(post.id)) continue
      seen.add(post.id)
      picks.push(post)
      taken += 1
    }
  }

  take(tiers.curated, PICK_SLOTS)
  take(tiers.featured, FEATURED_SLOTS)
  take(tiers.recent, PICK_SLOTS)

  return picks
}

/**
 * How many recent posts the page has to ask for.
 *
 * One for the Latest band, then enough to fill every pick slot on their own —
 * which is the worst case, and it is the ordinary one: when every flagged post
 * is also a recent post, the flag tier contributes no new candidates and
 * recency has to cover all six.
 */
export const RECENT_QUERY_SIZE = 1 + PICK_SLOTS
