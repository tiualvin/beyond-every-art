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
// The recency tier survives the opening taking the six newest pieces above this
// section. It is the reason the section is never empty on a site where nobody
// has curated anything yet, and once something is curated it only ever fills
// the slots the tiers above it left.
//
// Tier 2 is not a curation model on its own, which is why the chain has three
// rungs rather than two: a flag with no order and no expiry says "this was
// worth featuring once", which is a weaker claim than the section makes. Tier 1
// is the `picks` field on the Homepage global.

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
 * How many articles stand beside the lead in the opening.
 *
 * Chosen to make the two columns end level. The lead is a 16:9 plate, a
 * headline and a line of metadata; five runners at the width the second column
 * gets land within a few pixels of that. Three — where this started — left the
 * right-hand column about a third short, which is what made the module read as
 * a lead with an afterthought next to it rather than as one block.
 */
export const RUNNER_SLOTS = 5

/** The lead plus its runners. */
export const OPENING_SLOTS = 1 + RUNNER_SLOTS

/**
 * How many recent posts the page has to ask for.
 *
 * Enough for the opening and then enough to fill every pick slot after it, and
 * both halves are the worst case rather than a margin: when nothing is curated
 * and every flagged post is also a recent post, neither tier above recency
 * contributes a candidate the opening has not already used, so recency covers
 * all twelve on its own.
 */
export const RECENT_QUERY_SIZE = OPENING_SLOTS + PICK_SLOTS
